/*
 * Carregador do cardápio incorporável (sem dependências).
 *
 * Uso 1: Elemento Personalizado do Wix (Custom Element)
 *   URL do servidor: https://SUA-LOJA/embed.js   Nome da tag: doceria-cardapio
 *
 * Uso 2: qualquer página HTML
 *   <div id="doceria-cardapio"></div>
 *   <script src="https://SUA-LOJA/embed.js" data-target="#doceria-cardapio" async></script>
 *
 * Atributos opcionais: categoria (slug), limite (número), fundo (transparente|creme).
 * A altura do iframe acompanha o conteúdo (mensagem RESIZE do /embed).
 */
(function () {
  var script = document.currentScript;
  var scriptSrc = script && script.src ? script.src : "";
  var storeBase = scriptSrc ? scriptSrc.replace(/embed\.js(\?.*)?$/, "") : "/";

  function buildSrc(el) {
    var params = new URLSearchParams();
    ["categoria", "limite", "fundo"].forEach(function (name) {
      var value = el.getAttribute(name) || el.getAttribute("data-" + name);
      if (value) params.set(name, value);
    });
    var base = el.getAttribute("src") || el.getAttribute("data-src") || storeBase + "embed";
    var query = params.toString();
    return base + (query ? (base.indexOf("?") >= 0 ? "&" : "?") + query : "");
  }

  function mount(host) {
    if (host.__doceriaMounted) return;
    host.__doceriaMounted = true;
    var iframe = document.createElement("iframe");
    iframe.src = buildSrc(host);
    iframe.title = host.getAttribute("title") || "Cardápio";
    iframe.loading = "lazy";
    iframe.setAttribute("allow", "clipboard-write");
    iframe.style.cssText = "width:100%;border:0;display:block;min-height:420px;background:transparent;color-scheme:normal";
    host.appendChild(iframe);

    window.addEventListener("message", function (event) {
      if (event.source !== iframe.contentWindow) return;
      var data = event.data;
      if (!data || data.source !== "doceria-embed" || typeof data.type !== "string") return;
      if (data.type === "RESIZE" && typeof data.height === "number") {
        iframe.style.height = Math.max(320, Math.ceil(data.height)) + "px";
        return;
      }
      host.dispatchEvent(new CustomEvent("doceria:" + data.type.toLowerCase(), { detail: data.payload || null, bubbles: true }));
    });
  }

  if (window.customElements && !window.customElements.get("doceria-cardapio")) {
    window.customElements.define(
      "doceria-cardapio",
      class extends HTMLElement {
        connectedCallback() {
          this.style.display = "block";
          mount(this);
        }
      }
    );
  }

  var targetSelector = script && script.getAttribute("data-target");
  if (targetSelector) {
    var ready = function () {
      var target = document.querySelector(targetSelector);
      if (target) {
        ["categoria", "limite", "fundo", "src"].forEach(function (name) {
          var value = script.getAttribute("data-" + name);
          if (value && !target.getAttribute("data-" + name)) target.setAttribute("data-" + name, value);
        });
        mount(target);
      }
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
    else ready();
  }
})();
