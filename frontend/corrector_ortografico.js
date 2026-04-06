window.initCorrectorOrtografico = function ()  {
  const API = "http://127.0.0.1:5050";
  const $ = (id) => document.getElementById(id);

  const fileInput = $("file");
  const drop = $("drop");
  const viewOriginal = $("viewOriginal");
  const viewCorregido = $("viewCorregido");
  const loaderOriginal = $("loaderOriginal");
  const loaderCorregido = $("loaderCorregido");
  const btnLimpiar = $("btnLimpiar");
  const btnCorregir = $("btnCorregir");         // LanguageTool
  const btnCorregirWrap = $("btnCorregirWrap");
 
  const btnDescDocx = $("btnDescDocx");
  const btnDescPdf = $("btnDescPdf");
  const estadoOriginal = $("estadoOriginal");
  const estadoCorregido = $("estadoCorregido");
  const badge = $("badgeCorrecciones");
  const placeholderOriginal = $("placeholderOriginal");
  const placeholderCorregido = $("placeholderCorregido");

  let lastLinks = null;
  let lastEngine = "LT"; // o "LM"
  let archivoActual = null;
  let originalPreviewReady = false;
  let originalLoading = false;
  let corregirTooltip = null;
  let actionsLocked = false;
  let busyDownloadBtn = null;
  const actionButtons = [btnCorregir, btnLimpiar, btnDescDocx, btnDescPdf];

  const MSG_NO_DOCX = "Carga un archivo .docx para habilitar sugerencias.";
  const MSG_VISTA_NO_LISTA = "Espera a que la vista del documento original este lista.";
  const MSG_VISTA_SUG_NO_LISTA = "Espera a que la vista de sugerencias este lista.";

  async function dlgAlert(msg, opts) {
    const p =
      window.EvaluniaDialog &&
      typeof window.EvaluniaDialog.alert === "function"
        ? window.EvaluniaDialog.alert(msg, opts || {})
        : Promise.resolve(window.alert(msg));
    await p;
  }

  function abs(url){ return url.startsWith("http") ? url : API + url; }
  function setEstadoOriginal(msg){ if (estadoOriginal) estadoOriginal.textContent = msg || ""; }
  function setEstadoCorregido(msg){ if (estadoCorregido) estadoCorregido.textContent = msg || ""; }
  function showLoader(which, on=true){
    const targetLoader = which === "orig" ? loaderOriginal : loaderCorregido;
    if (targetLoader) targetLoader.classList.toggle("show", false);
    const targetPlaceholder = which === "orig" ? placeholderOriginal : placeholderCorregido;
    if (!targetPlaceholder || targetPlaceholder.hidden) return;
    targetPlaceholder.classList.toggle("is-loading", !!on);
  }
  function setPlaceholder(which, show = true, message = "", loading = false){
    const target = which === "orig" ? placeholderOriginal : placeholderCorregido;
    if (!target) return;
    const textEl = target.querySelector(".viewer-placeholder__text");
    const defaultText = target.dataset.defaultText || "";
    target.hidden = !show;
    target.classList.toggle("is-loading", show && !!loading);
    if (textEl) textEl.textContent = message || defaultText;
  }

  function disposeCorregirTooltip(){
    if (corregirTooltip) {
      corregirTooltip.dispose();
      corregirTooltip = null;
    }
  }

  function setCorregirTooltip(msg){
    if (!btnCorregirWrap) return;
    disposeCorregirTooltip();
    btnCorregirWrap.removeAttribute("title");
    btnCorregirWrap.removeAttribute("data-bs-toggle");
    btnCorregirWrap.removeAttribute("data-bs-placement");
    btnCorregirWrap.removeAttribute("data-bs-original-title");
    if (!msg || !window.bootstrap?.Tooltip) return;
    btnCorregirWrap.setAttribute("title", msg);
    btnCorregirWrap.setAttribute("data-bs-toggle", "tooltip");
    btnCorregirWrap.setAttribute("data-bs-placement", "top");
    corregirTooltip = new bootstrap.Tooltip(btnCorregirWrap, {
      trigger: "hover focus"
    });
  }

  function setDropLocked(locked){
    originalLoading = !!locked;
    if (!drop) return;
    drop.classList.toggle("is-disabled", originalLoading);
    drop.setAttribute("aria-disabled", originalLoading ? "true" : "false");
  }

  function syncCorregirButtonState({ forceDisabled = false } = {}){
    if (forceDisabled) {
      btnCorregir.disabled = true;
      setCorregirTooltip("");
      return;
    }
    if (!archivoActual) {
      btnCorregir.disabled = true;
      setCorregirTooltip(MSG_NO_DOCX);
      return;
    }
    if (!originalPreviewReady) {
      btnCorregir.disabled = true;
      setCorregirTooltip(MSG_VISTA_NO_LISTA);
      return;
    }
    if (placeholderCorregido && !placeholderCorregido.hidden) {
      const corrMsg = (placeholderCorregido.querySelector(".viewer-placeholder__text")?.textContent || "").toLowerCase();
      const corrLoading = placeholderCorregido.classList.contains("is-loading");
      if (corrLoading || corrMsg.includes("corrigiendo")) {
        btnCorregir.disabled = true;
        setCorregirTooltip(MSG_VISTA_SUG_NO_LISTA);
        return;
      }
    }
    btnCorregir.disabled = false;
    setCorregirTooltip("");
  }

  function disableDownloads(){
    lastLinks=null;
    [btnDescDocx, btnDescPdf].forEach(b=>b.disabled=true);
  }

  function setButtonBusy(btn, busy, labelWhenBusy = ""){
    if (!btn) return;
    if (busy) {
      if (!btn.dataset.originalLabel) {
        const label = btn.querySelector("span");
        btn.dataset.originalLabel = label ? label.textContent : btn.textContent;
      }
      btn.classList.add("is-busy");
      btn.setAttribute("aria-busy", "true");
      const label = btn.querySelector("span");
      if (label) label.textContent = labelWhenBusy || btn.dataset.originalLabel;
      const icon = btn.querySelector(".bi");
      if (icon) icon.classList.add("d-none");
      if (!btn.querySelector(".corrector-btn-spinner")) {
        const sp = document.createElement("span");
        sp.className = "spinner-border spinner-border-sm corrector-btn-spinner";
        sp.setAttribute("aria-hidden", "true");
        btn.insertBefore(sp, btn.firstChild);
      }
      return;
    }
    btn.classList.remove("is-busy");
    btn.removeAttribute("aria-busy");
    const label = btn.querySelector("span");
    if (label && btn.dataset.originalLabel) label.textContent = btn.dataset.originalLabel;
    const sp = btn.querySelector(".corrector-btn-spinner");
    if (sp) sp.remove();
    const icon = btn.querySelector(".bi");
    if (icon) icon.classList.remove("d-none");
  }

  function lockButtonBaseWidths(){
    actionButtons.forEach((btn) => {
      if (!btn) return;
      const label = btn.querySelector("span");
      if (!btn.dataset.originalLabel && label) {
        btn.dataset.originalLabel = label.textContent;
      }
      if (!btn.dataset.baseWidthLocked) {
        const width = btn.offsetWidth || 0;
        if (width > 0) {
          btn.style.width = `${width}px`;
          btn.dataset.baseWidthLocked = "1";
        }
      }
    });
  }

  function syncActionButtonsState(){
    btnLimpiar.disabled = actionsLocked;
    btnDescDocx.disabled = actionsLocked || !lastLinks?.docx;
    btnDescPdf.disabled = actionsLocked || !lastLinks?.docx;
    syncCorregirButtonState({ forceDisabled: actionsLocked || !!busyDownloadBtn });
  }

  function setActionsLocked(locked){
    actionsLocked = !!locked;
    if (!actionsLocked) {
      actionButtons.forEach((btn) => setButtonBusy(btn, false));
    }
    syncActionButtonsState();
  }

  function setBadge(val){
    if(typeof val === "number" && val > 0){
      badge.textContent = `${val} sugerencias`;
      badge.hidden = false;
      return;
    }
    if(typeof val === "string" && val.trim()){
      badge.textContent = val;
      badge.hidden = false;
      return;
    }
    badge.hidden = true;
  }

  function withPdfZoom(url){
  // Fit horizontal (ancho). Mejor soporte en Chrome/Electron que "zoom=page-width"
  const sep = url.includes("#") ? "&" : "#";
  return `${url}${sep}view=FitH`;
}

function limpiar(){
  setActionsLocked(false);
  setDropLocked(false);
  if (busyDownloadBtn) {
    setButtonBusy(busyDownloadBtn, false);
    busyDownloadBtn = null;
  }
  setButtonBusy(btnCorregir, false);
  archivoActual = null;
  originalPreviewReady = false;
  viewOriginal.src = "about:blank";
  viewCorregido.src = "about:blank";
  fileInput.value = "";
  setEstadoOriginal("");
  setEstadoCorregido("");
  setPlaceholder("orig", true);
  setPlaceholder("corr", true);
  showLoader("orig", false);
  showLoader("corr", false);
  disableDownloads();
  setBadge("");
  lastEngine = "LT";
  syncActionButtonsState();
}


  async function subirYRenderizar(file){
    const fd = new FormData();
    fd.append("archivo", file);
    const r = await fetch(`${API}/api/render_vista`, { method:"POST", body:fd });
    if(!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    if(!j.ok) throw new Error(j.error || "Error");
    return j.html_url;
  }

  async function handleFile(f){
     if(!f) return;
    archivoActual = f;
    originalPreviewReady = false;
    setDropLocked(true);
    setEstadoOriginal("");
    setEstadoCorregido("");
    setPlaceholder("orig", true, "Preparando vista PDF...", true);
    setPlaceholder("corr", true);
    showLoader("orig", true);
    disableDownloads();
    setBadge("");
    syncActionButtonsState();

    try{
      const url = await subirYRenderizar(f);
      viewOriginal.addEventListener("load", () => {
        showLoader("orig", false);
        originalPreviewReady = true;
        setDropLocked(false);
        setPlaceholder("orig", false);
        setEstadoOriginal("Listo.");
        syncActionButtonsState();
      }, { once:true });
      viewOriginal.src = withPdfZoom(abs(url));
    }catch(e){
      console.error(e);
      showLoader("orig", false);
      originalPreviewReady = false;
      setDropLocked(false);
      setPlaceholder("orig", true, "No se pudo generar la vista PDF.");
      setEstadoOriginal("No se pudo generar la vista PDF.");
      syncActionButtonsState();
      await dlgAlert("Error al generar la vista PDF.\n\n" + e.message, {
        variant: "danger",
      });
    }
  }
fileInput.addEventListener("click", () => {
  fileInput.value = "";
});

fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  drop.addEventListener("dragover", (e)=>{
    if (originalLoading) return;
    e.preventDefault();
    drop.style.opacity=".85";
  });
  drop.addEventListener("dragleave", ()=> {
    if (originalLoading) return;
    drop.style.opacity="1";
  });
  drop.addEventListener("drop", (e)=>{
    if (originalLoading) return;
    e.preventDefault(); drop.style.opacity="1";
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if(f) handleFile(f);
  });
  drop.addEventListener("click", ()=> {
    if (originalLoading) return;
    fileInput.click();
  });

  btnLimpiar.addEventListener("click", limpiar);

  async function downloadViaFetch(url, fallbackFilename, busyBtn, busyLabel){
    setActionsLocked(true);
    busyDownloadBtn = busyBtn || null;
    if (busyDownloadBtn) setButtonBusy(busyDownloadBtn, true, busyLabel);
    try {
      const r = await fetch(url);
      if(!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      let filename = fallbackFilename;
      const cd = r.headers.get("content-disposition");
      const m = cd && cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^"]+)"?/i);
      if(m) filename = decodeURIComponent(m[1] || m[2]);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename || "archivo";
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } finally {
      if (busyDownloadBtn) setButtonBusy(busyDownloadBtn, false);
      busyDownloadBtn = null;
      setActionsLocked(false);
    }
  }

  btnDescDocx.addEventListener("click", async ()=>{
    if (actionsLocked) return;
    try{
      if(!lastLinks?.docx) return;
      const fileName = lastLinks.docx.split("/").pop();
      await downloadViaFetch(abs(lastLinks.docx), fileName, btnDescDocx, "Preparando DOCX...");
    }catch(e){ await dlgAlert("No se pudo descargar el DOCX.\n\n" + e.message, { variant: "danger" }); }
  });

  btnDescPdf.addEventListener("click", async ()=>{
    if (actionsLocked) return;
    try{
      if(!lastLinks?.docx) return;
      const nombreDocx = lastLinks.docx.split("/").pop();
      const url = `${API}/api/descargar_pdf_corregido/${encodeURIComponent(nombreDocx)}`;
      const base = nombreDocx.replace(/\.docx$/i, ".pdf");
      await downloadViaFetch(url, base, btnDescPdf, "Preparando PDF...");
    }catch(e){ await dlgAlert("No se pudo descargar el PDF.\n\n" + e.message, { variant: "danger" }); }
  });

  async function corregirConBackend({ engineName, endpoint, buildFormData, badgeValue }) {
    const f = archivoActual;
if(!f){
  await dlgAlert("Selecciona primero un .docx", { variant: "warning" });
  return;
}

    setEstadoCorregido("");
    syncCorregirButtonState({ forceDisabled: true });
    setButtonBusy(btnCorregir, true, "Generando sugerencias...");
   
    showLoader("corr", true);
    setPlaceholder("corr", true, `Corrigiendo con ${engineName}...`, true);
    disableDownloads();
    setBadge("");

    try{
      const fd = buildFormData(f);

      const r = await fetch(`${API}${endpoint}`, { method:"POST", body:fd });
      if(!r.ok){
        let msg = `HTTP ${r.status}`;
        try{ const errJson = await r.json(); if(errJson?.error) msg = errJson.error; }catch{}
        throw new Error(msg);
      }

      const data = await r.json();
      if(!data.ok) throw new Error(data.error || "Error al corregir");

      lastLinks = data.descargas || {};
      btnDescDocx.disabled = true;
      btnDescPdf.disabled = true;
      setBadge("");

      

      // Render del DOCX (para mostrar PDF en el iframe)
      if(lastLinks.docx){
        let nombreDocx = lastLinks.docx.split("/").pop();

        // Para ver resaltado, cambiamos el limpio -> preview
        if(lastEngine === "LM"){
          
        } else {
          // LT (aunque tu backend ya lo hace, lo dejamos robusto)
          nombreDocx = nombreDocx.replace(/_corregido_limpio\.docx$/i, "_corregido.docx");
        }

        const r2 = await fetch(`${API}/api/render_docx_guardado_lt/${encodeURIComponent(nombreDocx)}`);
        if(!r2.ok) throw new Error(`HTTP ${r2.status}`);
        const j2 = await r2.json();
        if(!j2.ok) throw new Error(j2.error || "No se pudo renderizar PDF corregido");

        viewCorregido.addEventListener("load", () => {
          showLoader("corr", false);
          setPlaceholder("corr", false);
          if (typeof data.total_alertas === "number") setBadge(data.total_alertas);
          else setBadge(badgeValue || "Sugerencia aplicada");
          syncActionButtonsState();
          setEstadoCorregido(`Sugerencia aplicadas (${engineName}).`);
        }, { once:true });
        viewCorregido.src = withPdfZoom(abs(j2.html_url));
      } else {
        showLoader("corr", false);
        setPlaceholder("corr", true, "No se pudo preparar la vista de sugerencias.");
        setBadge("");
        disableDownloads();
        setEstadoCorregido("No se pudo preparar la vista de sugerencias.");
        syncActionButtonsState();
      }
    }catch(e){
      console.error(e);
      showLoader("corr", false);
      setPlaceholder("corr", true, "Error al corregir / renderizar.");
      setEstadoCorregido("Error al corregir / renderizar.");
      disableDownloads();
      await dlgAlert("Error al corregir / renderizar.\n\n" + e.message, {
        variant: "danger",
      });
      setBadge("");
    }finally{
      setButtonBusy(btnCorregir, false);
      syncActionButtonsState();
      
    }
  }

  // ====== BOTÓN: LanguageTool (YA TENÍAS) ======
  btnCorregir.addEventListener("click", async ()=>{
    await corregirConBackend({
      engineName: "LanguageTool",
      endpoint: "/api/corregir_archivo",
      buildFormData: (f) => {
        const fd = new FormData();
        fd.append("archivo", f);
        fd.append("idioma", "es-ES");
        fd.append("modo", "corregir");
        return fd;
      },
      badgeValue: "" // lo trae total_alertas
    });
  });

  lockButtonBaseWidths();
  syncActionButtonsState();

};
