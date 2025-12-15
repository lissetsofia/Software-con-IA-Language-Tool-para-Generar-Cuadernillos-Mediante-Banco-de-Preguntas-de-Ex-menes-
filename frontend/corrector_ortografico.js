(function () {
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
  const btnCorregirLM = $("btnCorregirLM");     // llama.cpp
  const btnDescDocx = $("btnDescDocx");
  const btnDescPdf = $("btnDescPdf");
  const tipoMostrado = $("tipoMostrado");
  const estado = $("estado");
  const overlay = $("processing");
  const overlayText = $("processingText");
  const badge = $("badgeCorrecciones");

  let lastLinks = null;
  let lastEngine = "LT"; // o "LM"

  function abs(url){ return url.startsWith("http") ? url : API + url; }
  function setEstado(msg){ estado.textContent = msg || ""; }
  function showLoader(which, on=true){ (which==="orig" ? loaderOriginal : loaderCorregido).classList.toggle("show", on); }

  function disableDownloads(){
    lastLinks=null;
    [btnDescDocx, btnDescPdf].forEach(b=>b.disabled=true);
  }

  function showOverlay(msg){ overlayText.textContent = msg || "Procesando…"; overlay.classList.add("show"); }
  function hideOverlay(){ overlay.classList.remove("show"); }

  function setBadge(val){
    if(typeof val === "number" && val > 0){
      badge.textContent = `${val} correcciones`;
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

  function withPdfZoom(url){ return url.includes("#") ? url : `${url}#zoom=page-width`; }

  function limpiar(){
    viewOriginal.src = "about:blank";
    viewCorregido.src = "about:blank";
    fileInput.value = "";
    setEstado("");
    showLoader("orig", false);
    showLoader("corr", false);
    disableDownloads();
    setBadge("");
    lastEngine = "LT";
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
    tipoMostrado.textContent = "Mostrando como PDF (visor del navegador).";
    setEstado("Preparando vista PDF…");
    showLoader("orig", true);
    disableDownloads();
    setBadge("");

    try{
      const url = await subirYRenderizar(f);
      viewOriginal.addEventListener("load", () => showLoader("orig", false), { once:true });
      viewOriginal.src = withPdfZoom(abs(url));
      setEstado("Listo.");
    }catch(e){
      console.error(e);
      showLoader("orig", false);
      setEstado("No se pudo generar la vista PDF.");
      alert("Error al generar la vista PDF.\n\n" + e.message);
    }
  }

  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));
  drop.addEventListener("dragover", (e)=>{ e.preventDefault(); drop.style.opacity=".85"; });
  drop.addEventListener("dragleave", ()=> drop.style.opacity="1");
  drop.addEventListener("drop", (e)=>{
    e.preventDefault(); drop.style.opacity="1";
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if(f) handleFile(f);
  });
  drop.addEventListener("click", ()=> fileInput.click());

  btnLimpiar.addEventListener("click", limpiar);

  async function downloadViaFetch(url, fallbackFilename){
    showOverlay("Preparando descarga…");
    try{
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
    } finally { hideOverlay(); }
  }

  btnDescDocx.addEventListener("click", async ()=>{
    try{
      if(!lastLinks?.docx) return;
      const fileName = lastLinks.docx.split("/").pop();
      await downloadViaFetch(abs(lastLinks.docx), fileName);
    }catch(e){ alert("No se pudo descargar el DOCX.\n\n" + e.message); }
  });

  btnDescPdf.addEventListener("click", async ()=>{
    try{
      if(!lastLinks?.docx) return;
      const nombreDocx = lastLinks.docx.split("/").pop();
      const url = `${API}/api/descargar_pdf_corregido/${encodeURIComponent(nombreDocx)}`;
      const base = nombreDocx.replace(/\.docx$/i, ".pdf");
      await downloadViaFetch(url, base);
    }catch(e){ alert("No se pudo descargar el PDF.\n\n" + e.message); }
  });

  async function corregirConBackend({ engineName, endpoint, buildFormData, badgeValue }) {
    const f = fileInput.files && fileInput.files[0];
    if(!f){ alert("Selecciona primero un .docx"); return; }

    setEstado(`Corrigiendo con ${engineName}…`);
    btnCorregir.disabled = true;
    btnCorregirLM.disabled = true;
    showLoader("corr", true);
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

      // Badge: LT trae total_alertas; LM no. (mostramos texto)
      if (typeof data.total_alertas === "number") setBadge(data.total_alertas);
      else setBadge(badgeValue || "Corrección aplicada");

      lastLinks = data.descargas || {};
      btnDescDocx.disabled = !lastLinks.docx;
      btnDescPdf.disabled  = !lastLinks.docx;

      lastEngine = (endpoint.includes("/api/lm/") ? "LM" : "LT");

      // Render del DOCX (para mostrar PDF en el iframe)
      if(lastLinks.docx){
        let nombreDocx = lastLinks.docx.split("/").pop();

        // Para ver resaltado, cambiamos el limpio -> preview
        if(lastEngine === "LM"){
          nombreDocx = nombreDocx.replace(/_lm_corregido_limpio\.docx$/i, "_lm_corregido.docx");
        } else {
          // LT (aunque tu backend ya lo hace, lo dejamos robusto)
          nombreDocx = nombreDocx.replace(/_corregido_limpio\.docx$/i, "_corregido.docx");
        }

        const r2 = await fetch(`${API}/api/render_docx_guardado_lt/${encodeURIComponent(nombreDocx)}`);
        if(!r2.ok) throw new Error(`HTTP ${r2.status}`);
        const j2 = await r2.json();
        if(!j2.ok) throw new Error(j2.error || "No se pudo renderizar PDF corregido");

        viewCorregido.addEventListener("load", () => showLoader("corr", false), { once:true });
        viewCorregido.src = withPdfZoom(abs(j2.html_url));
      } else {
        showLoader("corr", false);
      }

      setEstado(`Correcciones aplicadas (${engineName}).`);
    }catch(e){
      console.error(e);
      showLoader("corr", false);
      setEstado("Error al corregir / renderizar.");
      alert("Error al corregir / renderizar.\n\n" + e.message);
      setBadge("");
    }finally{
      btnCorregir.disabled = false;
      btnCorregirLM.disabled = false;
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

  // ====== BOTÓN: llama.cpp (LM local) ======
  btnCorregirLM.addEventListener("click", async ()=>{
    await corregirConBackend({
      engineName: "IA local (llama.cpp)",
      endpoint: "/api/lm/corregir_archivo",
      buildFormData: (f) => {
        const fd = new FormData();
        fd.append("archivo", f);
        return fd;
      },
      badgeValue: "IA aplicada"
    });
  });

})();
