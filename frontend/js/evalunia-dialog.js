/**
 * Diálogos informativos y de confirmación (Bootstrap 5), reutilizables en todo EVALUNIA.
 * Sustituye alert/confirm nativos con UI alineada a modal-evalunia.
 *
 * API:
 *   await EvaluniaDialog.alert(mensaje, { title?, variant? })
 *   await EvaluniaDialog.confirm(mensaje, { title?, variant?, confirmLabel?, cancelLabel?, dangerous? })
 *   await EvaluniaDialog.choose(mensaje, { title?, variant?, actions, cancelLabel? })
 *
 * variant: 'info' | 'success' | 'danger' | 'warning'
 * Si el mensaje empieza por ✅ / ❌ se infiere success / danger y se quita el prefijo.
 *
 * choose: actions = [{ value, label, className?, icon? }]
 *   icon: clase Bootstrap Icons, p. ej. "bi-file-earmark-pdf" (solo token bi-*).
 *   cancelLabel: si existe, el botón cancelar va en la misma fila que las acciones.
 * Devuelve Promise<string | null> (value elegido o null si cierra / cancela).
 */
(function (global) {
  const MODAL_ID = "evaluniaDialogModal";
  const TITLE_ID = "evaluniaDialogTitle";
  const ICON_ID = "evaluniaDialogIcon";
  const BODY_ID = "evaluniaDialogBody";
  const FOOTER_ID = "evaluniaDialogFooter";

  function sanitizeBiIcon(icon) {
    if (!icon || typeof icon !== "string") return "";
    const t = icon.trim();
    return /^bi-[a-z0-9-]+$/.test(t) ? t : "";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatMessage(msg) {
    return escapeHtml(String(msg)).replace(/\n/g, "<br>");
  }

  function normalizeVariantFromMessage(message, opts) {
    const m = String(message);
    if (opts && opts.variant) {
      return { text: m, variant: opts.variant };
    }
    if (/^✅\s?/.test(m)) {
      return { text: m.replace(/^✅\s?/, ""), variant: "success" };
    }
    if (/^✔\s?/.test(m)) {
      return { text: m.replace(/^✔\s?/, ""), variant: "success" };
    }
    if (/^❌\s?/.test(m)) {
      return { text: m.replace(/^❌\s?/, ""), variant: "danger" };
    }
    return { text: m, variant: (opts && opts.variant) || "info" };
  }

  function getVariantMeta(variant) {
    const map = {
      info: {
        icon: "bi-info-circle",
        title: "Información",
        headerClass: "evalunia-dialog-icon--info",
      },
      success: {
        icon: "bi-check-circle-fill",
        title: "Listo",
        headerClass: "evalunia-dialog-icon--success",
      },
      danger: {
        icon: "bi-exclamation-octagon-fill",
        title: "Error",
        headerClass: "evalunia-dialog-icon--danger",
      },
      warning: {
        icon: "bi-exclamation-triangle-fill",
        title: "Atención",
        headerClass: "evalunia-dialog-icon--warning",
      },
    };
    return map[variant] || map.info;
  }

  function ensureDialog() {
    if (document.getElementById(MODAL_ID)) return;

    const html = `
<div class="modal fade evalunia-dialog-modal" id="${MODAL_ID}" tabindex="-1"
     aria-hidden="true" data-bs-backdrop="true" data-bs-keyboard="true">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content modal-evalunia evalunia-dialog-content">
      <div class="modal-header evalunia-dialog-header border-0">
        <h5 class="modal-title d-flex align-items-center gap-2 mb-0 evalunia-dialog-title-wrap">
          <i id="${ICON_ID}" class="bi evalunia-dialog-title-icon" aria-hidden="true"></i>
          <span id="${TITLE_ID}">EVALUNIA</span>
        </h5>
        <button type="button" class="btn-close btn-close-white evalunia-dialog-btn-close" data-bs-dismiss="modal" data-evalunia-dialog-close
                aria-label="Cerrar"></button>
      </div>
      <div class="modal-body evalunia-dialog-body pt-2" id="${BODY_ID}"></div>
      <div class="modal-footer evalunia-dialog-footer border-0 pt-0" id="${FOOTER_ID}"></div>
    </div>
  </div>
</div>`;
    document.body.insertAdjacentHTML("beforeend", html);
  }

  function stackZIndex(modalEl) {
    const shown = document.querySelectorAll(".modal.show").length;
    const base = 1055 + shown * 30;
    modalEl.style.zIndex = String(base + 25);
    requestAnimationFrame(() => {
      const backs = document.querySelectorAll(".modal-backdrop");
      const last = backs[backs.length - 1];
      if (last) last.style.zIndex = String(base + 15);
    });
  }

  function getBootstrapModal() {
    if (!global.bootstrap || !global.bootstrap.Modal) {
      console.warn("[EvaluniaDialog] bootstrap.Modal no disponible");
      return null;
    }
    return global.bootstrap.Modal;
  }

  function alert(message, opts) {
    const Modal = getBootstrapModal();
    if (!Modal) {
      global.alert(String(message));
      return Promise.resolve();
    }

    ensureDialog();
    const options = opts || {};
    const { text, variant } = normalizeVariantFromMessage(message, options);
    const meta = getVariantMeta(variant);
    const title = options.title || meta.title;

    const modalEl = document.getElementById(MODAL_ID);
    const iconEl = document.getElementById(ICON_ID);
    const titleEl = document.getElementById(TITLE_ID);
    const bodyEl = document.getElementById(BODY_ID);
    const footerEl = document.getElementById(FOOTER_ID);

    titleEl.textContent = title;
    iconEl.className = `bi ${meta.icon} evalunia-dialog-title-icon ${meta.headerClass}`;
    bodyEl.className =
      "modal-body evalunia-dialog-body pt-2" +
      (!String(text).trim() ? " evalunia-dialog-body--tight" : "");
    bodyEl.innerHTML = formatMessage(text);
    footerEl.className =
      "modal-footer evalunia-dialog-footer border-0 pt-0";
    footerEl.innerHTML =
      '<button type="button" class="btn btn-primary px-4" data-evalunia-dialog-ok>Aceptar</button>';

    const bsModal = Modal.getOrCreateInstance(modalEl, {
      backdrop: true,
      keyboard: true,
    });

    return new Promise((resolve) => {
      const onShow = () => stackZIndex(modalEl);
      const onHidden = () => resolve();

      modalEl.addEventListener("show.bs.modal", onShow, { once: true });
      modalEl.addEventListener("hidden.bs.modal", onHidden, { once: true });

      footerEl
        .querySelector("[data-evalunia-dialog-ok]")
        .addEventListener("click", () => bsModal.hide(), { once: true });
      const closeBtn = modalEl.querySelector("[data-evalunia-dialog-close]");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => bsModal.hide(), { once: true });
      }

      bsModal.show();
    });
  }

  function confirm(message, opts) {
    const Modal = getBootstrapModal();
    if (!Modal) {
      return Promise.resolve(global.confirm(String(message)));
    }

    ensureDialog();
    const options = opts || {};
    const variant = options.variant || "warning";
    const meta = getVariantMeta(variant);
    const title = options.title || "Confirmar";
    const confirmLabel = options.confirmLabel || "Aceptar";
    const cancelLabel = options.cancelLabel || "Cancelar";
    const dangerous =
      options.dangerous === true ||
      (options.dangerous !== false && variant === "danger");
    const confirmClass = dangerous ? "btn-danger" : "btn-primary";

    const modalEl = document.getElementById(MODAL_ID);
    const iconEl = document.getElementById(ICON_ID);
    const titleEl = document.getElementById(TITLE_ID);
    const bodyEl = document.getElementById(BODY_ID);
    const footerEl = document.getElementById(FOOTER_ID);

    titleEl.textContent = title;
    iconEl.className = `bi ${meta.icon} evalunia-dialog-title-icon ${meta.headerClass}`;
    bodyEl.className =
      "modal-body evalunia-dialog-body pt-2" +
      (!String(message).trim() ? " evalunia-dialog-body--tight" : "");
    bodyEl.innerHTML = formatMessage(String(message));
    footerEl.className =
      "modal-footer evalunia-dialog-footer border-0 pt-0";
    footerEl.innerHTML = `
      <button type="button" class="btn btn-outline-secondary" data-evalunia-dialog-cancel>${escapeHtml(cancelLabel)}</button>
      <button type="button" class="btn ${confirmClass}" data-evalunia-dialog-confirm>${escapeHtml(confirmLabel)}</button>
    `;

    const bsModal = Modal.getOrCreateInstance(modalEl, {
      backdrop: true,
      keyboard: true,
    });

    return new Promise((resolve) => {
      let finished = false;
      const finish = (value) => {
        if (finished) return;
        finished = true;
        resolve(value);
        bsModal.hide();
      };

      const onShow = () => stackZIndex(modalEl);

      const onHidden = () => {
        modalEl.removeEventListener("show.bs.modal", onShow);
        modalEl.removeEventListener("hidden.bs.modal", onHidden);
        if (!finished) finish(false);
      };

      modalEl.addEventListener("show.bs.modal", onShow, { once: true });
      modalEl.addEventListener("hidden.bs.modal", onHidden, { once: true });

      footerEl
        .querySelector("[data-evalunia-dialog-cancel]")
        .addEventListener("click", () => finish(false), { once: true });
      footerEl
        .querySelector("[data-evalunia-dialog-confirm]")
        .addEventListener("click", () => finish(true), { once: true });
      const closeBtn = modalEl.querySelector("[data-evalunia-dialog-close]");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => finish(false), { once: true });
      }

      bsModal.show();
    });
  }

  function choose(message, opts) {
    const Modal = getBootstrapModal();
    if (!Modal) {
      const m = String(message || "").trim();
      const pick = global.prompt(
        m || "Elige una opción (escribe el valor exacto)"
      );
      return Promise.resolve(pick || null);
    }

    ensureDialog();
    const options = opts || {};
    const actions = Array.isArray(options.actions) ? options.actions : [];
    if (!actions.length) {
      console.warn("[EvaluniaDialog.choose] Sin actions; devuelvo null");
      return Promise.resolve(null);
    }

    const variant = options.variant || "info";
    const meta = getVariantMeta(variant);
    const title =
      options.title || "Elige una opción";
    const cancelLabel =
      options.cancelLabel === false ? null : options.cancelLabel || "Cancelar";

    const { text } = normalizeVariantFromMessage(message, {
      ...options,
      variant,
    });

    const modalEl = document.getElementById(MODAL_ID);
    const iconEl = document.getElementById(ICON_ID);
    const titleEl = document.getElementById(TITLE_ID);
    const bodyEl = document.getElementById(BODY_ID);
    const footerEl = document.getElementById(FOOTER_ID);

    titleEl.textContent = title;
    iconEl.className = `bi ${meta.icon} evalunia-dialog-title-icon ${meta.headerClass}`;
    const msgTrim = String(text || "").trim();
    bodyEl.className =
      "modal-body evalunia-dialog-body evalunia-dialog-body--choice pt-2 pb-2";
    const leadHtml = msgTrim
      ? `<p class="evalunia-dialog-choice-lead mb-0">${formatMessage(text)}</p>`
      : "";

    const actionButtons = actions
      .map((a, i) => {
        const v = a && a.value != null ? String(a.value) : "";
        const lab =
          a && a.label != null ? String(a.label) : v || `Opción ${i + 1}`;
        const cls = (a && a.className) || "btn-primary";
        const bi = sanitizeBiIcon(a && a.icon);
        const iconHtml = bi
          ? `<i class="bi ${bi} evalunia-dialog-choice-btn-icon" aria-hidden="true"></i>`
          : "";
        const labelHtml = `<span>${escapeHtml(lab)}</span>`;
        return `<button type="button" class="btn evalunia-dialog-choice-btn ${escapeHtml(
          cls
        )}" data-evalunia-dialog-choice="${escapeHtml(v)}">${iconHtml}${labelHtml}</button>`;
      })
      .join("");

    const cancelBtnHtml =
      cancelLabel != null
        ? `<button type="button" class="btn btn-outline-secondary evalunia-dialog-choice-btn evalunia-dialog-choice-btn--cancel" data-evalunia-dialog-cancel><i class="bi bi-x-lg evalunia-dialog-choice-btn-icon" aria-hidden="true"></i><span>${escapeHtml(cancelLabel)}</span></button>`
        : "";

    bodyEl.innerHTML =
      leadHtml +
      `<div class="evalunia-dialog-choice-row" role="group" aria-label="Opciones">${actionButtons}${cancelBtnHtml}</div>`;

    footerEl.className =
      "modal-footer evalunia-dialog-footer border-0 d-none p-0 m-0";
    footerEl.innerHTML = "";
    modalEl.classList.toggle("evalunia-dialog-modal--choice", true);

    const bsModal = Modal.getOrCreateInstance(modalEl, {
      backdrop: true,
      keyboard: true,
    });

    return new Promise((resolve) => {
      let finished = false;
      const finish = (value) => {
        if (finished) return;
        finished = true;
        modalEl.classList.remove("evalunia-dialog-modal--choice");
        resolve(value);
        bsModal.hide();
      };

      const onShow = () => stackZIndex(modalEl);

      const onHidden = () => {
        modalEl.removeEventListener("show.bs.modal", onShow);
        modalEl.removeEventListener("hidden.bs.modal", onHidden);
        modalEl.classList.remove("evalunia-dialog-modal--choice");
        if (!finished) finish(null);
      };

      modalEl.addEventListener("show.bs.modal", onShow, { once: true });
      modalEl.addEventListener("hidden.bs.modal", onHidden, { once: true });

      modalEl.querySelectorAll("[data-evalunia-dialog-choice]").forEach((btn) => {
        btn.addEventListener(
          "click",
          () => finish(btn.getAttribute("data-evalunia-dialog-choice")),
          { once: true }
        );
      });

      const cancelBtn = modalEl.querySelector("[data-evalunia-dialog-cancel]");
      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => finish(null), { once: true });
      }
      const closeBtn = modalEl.querySelector("[data-evalunia-dialog-close]");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => finish(null), { once: true });
      }

      bsModal.show();
    });
  }

  global.EvaluniaDialog = {
    alert,
    confirm,
    choose,
    ensureDialog,
  };
})(typeof window !== "undefined" ? window : globalThis);
