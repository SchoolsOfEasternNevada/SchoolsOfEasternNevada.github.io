(function () {
  "use strict";

  const REPO_BASE = "https://raw.githubusercontent.com/BWeducation/premiumopensource/main";
  const MANIFEST_URL = REPO_BASE + "/folder_structure.txt";
  const START_PAGE = "premium.html";

  let assetMap = {};
  let isRunning = false;
  let clickInterceptorInstalled = false;
  let historyHandlerInstalled = false;
  let windowOpenPatched = false;
  let currentPagePath = START_PAGE;

  function isSkippableHref(href) {
    if (!href) return true;
    const v = href.trim().toLowerCase();
    return (
      v.startsWith("#") ||
      v.startsWith("javascript:") ||
      v.startsWith("data:") ||
      v.startsWith("mailto:") ||
      v.startsWith("tel:")
    );
  }

  function toRepoPath(input) {
    if (!input) return "";
    const val = input.trim();

    if (val.startsWith(REPO_BASE + "/")) {
      return val.slice((REPO_BASE + "/").length);
    }

    if (/^https?:\/\//i.test(val)) {
      return "";
    }

    return val.replace(/^(\.\/|\.\.\/)+/, "").replace(/^\/+/, "");
  }

  function normalizePath(path) {
    if (!path) return "";
    return path
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/\/+/g, "/");
  }

  function resolveRelativePath(basePath, maybeRelative) {
    if (!maybeRelative) return "";
    const raw = maybeRelative.trim();

    if (/^(https?:|data:|blob:|javascript:|mailto:|tel:|#)/i.test(raw)) {
      return toRepoPath(raw);
    }

    const base = normalizePath(basePath || START_PAGE);
    const root = "https://local.invalid/";
    const baseForUrl = base.includes("/") ? base : "";
    const resolved = new URL(raw, root + baseForUrl).pathname;
    return normalizePath(resolved);
  }

  function toRepoUrl(pathOrUrl) {
    if (!pathOrUrl) return "";
    if (/^https?:\/\//i.test(pathOrUrl)) {
      if (pathOrUrl.startsWith(REPO_BASE + "/")) return pathOrUrl;
      return "";
    }
    const clean = toRepoPath(pathOrUrl);
    if (!clean) return "";

    // Keep root html pages stable (for example index.html) and avoid basename collisions.
    if (!clean.includes("/") && /\.html?$/i.test(clean)) {
      return assetMap[clean] || (REPO_BASE + "/" + clean);
    }

    return assetMap[clean] || assetMap[clean.split("/").pop()] || (REPO_BASE + "/" + clean);
  }

  function getPathFromHash() {
    const hash = (location.hash || "").replace(/^#/, "");
    if (!hash) return "";
    return normalizePath(hash);
  }

  function setRouteHash(path) {
    const clean = normalizePath(path || START_PAGE);
    const newHash = "#" + clean;
    if (location.hash !== newHash) {
      history.pushState({ ghPath: clean }, "", newHash);
    }
  }

  function extractNavPath(rawValue, basePath) {
    if (!rawValue) return "";
    const raw = String(rawValue).trim();
    if (!raw) return "";

    if (raw.startsWith(REPO_BASE + "/")) {
      return normalizePath(toRepoPath(raw));
    }

    if (/^https?:\/\//i.test(raw)) {
      return "";
    }

    return normalizePath(resolveRelativePath(basePath || currentPagePath, raw));
  }

  function findButtonTargetPath(el) {
    if (!el) return "";

    const attrPath =
      el.getAttribute("data-gh-path") ||
      el.getAttribute("data-href") ||
      el.getAttribute("data-url") ||
      el.getAttribute("formaction");
    if (attrPath) return extractNavPath(attrPath, currentPagePath);

    const onclick = el.getAttribute("onclick") || "";
    const locMatch = onclick.match(/(?:window\.)?location(?:\.href)?\s*=\s*['\"]([^'\"]+)['\"]/i);
    if (locMatch && locMatch[1]) return extractNavPath(locMatch[1], currentPagePath);

    const openMatch = onclick.match(/window\.open\(\s*['\"]([^'\"]+)['\"]/i);
    if (openMatch && openMatch[1]) return extractNavPath(openMatch[1], currentPagePath);

    return "";
  }

  async function openBlobTab(targetPath) {
    const cleanPath = normalizePath(targetPath || currentPagePath || START_PAGE);
    const sourceUrl = toRepoUrl(cleanPath);
    if (!sourceUrl) return;

    try {
      const res = await fetch(sourceUrl, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);

      const htmlText = await res.text();
      const parser = new DOMParser();
      const blobDoc = parser.parseFromString(htmlText, "text/html");

      await inlineStyles(blobDoc, cleanPath);
      await inlineScripts(blobDoc, cleanPath);
      rewriteNonAnchorAssets(blobDoc, cleanPath);

      const base = blobDoc.createElement("base");
      base.href = REPO_BASE + "/";
      blobDoc.head.appendChild(base);

      const blobHtml = "<!doctype html>\n" + blobDoc.documentElement.outerHTML;
      const blobUrl = URL.createObjectURL(new Blob([blobHtml], { type: "text/html" }));
      window.open(blobUrl, "_blank", "noopener,noreferrer");

      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
    } catch (err) {
      console.error("Blob tab open failed:", err);
    }
  }

  function launchStandaloneRendererTab(startPath) {
    const safeStart = normalizePath(startPath || START_PAGE) || START_PAGE;

    const appHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>GitHub Live Renderer</title>
  <style>
    html, body { margin: 0; padding: 0; }
    body { font-family: Segoe UI, Arial, sans-serif; }
    #boot { padding: 12px; background: #111; color: #0f0; font-size: 12px; }
  </style>
</head>
<body>
  <div id="boot">Booting live renderer...</div>
  <script>
  (function () {
    "use strict";

    const REPO_BASE = ${JSON.stringify(REPO_BASE)};
    const MANIFEST_URL = ${JSON.stringify(MANIFEST_URL)};
    const START_PAGE = ${JSON.stringify(safeStart)};

    let assetMap = {};
    let currentPagePath = START_PAGE;

    function normalizePath(path) {
      if (!path) return "";
      let out = String(path).replaceAll(String.fromCharCode(92), "/");
      while (out.startsWith("/")) out = out.slice(1);
      while (out.includes("//")) out = out.replace("//", "/");
      return out;
    }

    function toRepoPath(input) {
      if (!input) return "";
      const val = String(input).trim();
      if (val.startsWith(REPO_BASE + "/")) return normalizePath(val.slice((REPO_BASE + "/").length));
      if (/^https?:\\/\\//i.test(val)) return "";
      let rel = val;
      while (rel.startsWith("./")) rel = rel.slice(2);
      while (rel.startsWith("../")) rel = rel.slice(3);
      while (rel.startsWith("/")) rel = rel.slice(1);
      return normalizePath(rel);
    }

    function resolveRelativePath(basePath, maybeRelative) {
      if (!maybeRelative) return "";
      const raw = String(maybeRelative).trim();
      if (/^(https?:|data:|blob:|javascript:|mailto:|tel:|#)/i.test(raw)) return toRepoPath(raw);
      const base = normalizePath(basePath || START_PAGE);
      const root = "https://local.invalid/";
      const baseForUrl = base.includes("/") ? base : "";
      return normalizePath(new URL(raw, root + baseForUrl).pathname);
    }

    function toRepoUrl(pathOrUrl) {
      if (!pathOrUrl) return "";
      if (/^https?:\\/\\//i.test(pathOrUrl)) {
        if (pathOrUrl.startsWith(REPO_BASE + "/")) return pathOrUrl;
        return "";
      }
      const clean = toRepoPath(pathOrUrl);
      if (!clean) return "";
      if (!clean.includes("/") && /\\.html?$/i.test(clean)) {
        return assetMap[clean] || (REPO_BASE + "/" + clean);
      }
      return assetMap[clean] || assetMap[clean.split("/").pop()] || (REPO_BASE + "/" + clean);
    }

    function isInternalPagePath(path) {
      if (!path) return false;
      const clean = String(path).split("?")[0].split("#")[0].toLowerCase();
      if (!clean) return false;
      if (clean.endsWith("/")) return true;
      if (clean.endsWith(".html") || clean.endsWith(".htm")) return true;
      if (!clean.includes(".")) return true;
      return false;
    }

    async function inlineStyles(newDoc, pagePath) {
      const links = Array.from(newDoc.querySelectorAll('link[rel="stylesheet"][href]'));
      for (const link of links) {
        try {
          const cssPath = resolveRelativePath(pagePath, link.getAttribute("href"));
          const cssUrl = toRepoUrl(cssPath);
          if (!cssUrl) continue;
          const cssRes = await fetch(cssUrl, { cache: "no-cache" });
          if (!cssRes.ok) continue;
          let css = await cssRes.text();
          css = css.replace(/url\\(['\"]?([^'\")]+)['\"]?\\)/g, (m, p) => {
            if (/^(https?:|data:|blob:)/i.test(p)) return m;
            const fixed = toRepoUrl(resolveRelativePath(cssPath || pagePath, p));
            return fixed ? 'url("' + fixed + '")' : m;
          });
          const style = document.createElement("style");
          style.textContent = css;
          link.replaceWith(style);
        } catch (_) {}
      }
    }

    async function inlineScripts(newDoc, pagePath) {
      const scripts = Array.from(newDoc.querySelectorAll("script[src]"));
      for (const script of scripts) {
        try {
          const scriptPath = resolveRelativePath(pagePath, script.getAttribute("src"));
          const scriptUrl = toRepoUrl(scriptPath);
          if (!scriptUrl) continue;
          const jsRes = await fetch(scriptUrl, { cache: "no-cache" });
          if (!jsRes.ok) continue;
          script.removeAttribute("src");
          script.textContent = await jsRes.text();
        } catch (_) {}
      }
    }

    function rewriteAssets(newDoc, pagePath) {
      newDoc.querySelectorAll("[src]").forEach((el) => {
        const src = el.getAttribute("src");
        if (!src || /^(https?:|data:|blob:)/i.test(src)) return;
        const fixed = toRepoUrl(resolveRelativePath(pagePath, src));
        if (fixed) {
          // Mark iframes for special async loading to prevent raw file display
          if (el.tagName.toLowerCase() === "iframe") {
            el.setAttribute("data-game-src", fixed);
            el.setAttribute("src", "about:blank");
          } else {
            el.setAttribute("src", fixed);
          }
        }
      });
      newDoc.querySelectorAll("link[href]").forEach((el) => {
        if (el.matches('link[rel="stylesheet"]')) return;
        const href = el.getAttribute("href");
        if (!href || /^(https?:|data:|blob:|#|javascript:|mailto:|tel:)/i.test(href)) return;
        const fixed = toRepoUrl(resolveRelativePath(pagePath, href));
        if (fixed) el.setAttribute("href", fixed);
      });

      // Make internal page links non-navigating so browser cannot jump to raw URLs.
      newDoc.querySelectorAll("a[href]").forEach((a) => {
        const href = a.getAttribute("href") || "";
        if (!href || /^(#|javascript:|data:|mailto:|tel:)/i.test(href)) return;

        const routePath = resolveRelativePath(pagePath, href);
        if (!isInternalPagePath(routePath)) return;

        a.setAttribute("data-gh-path", routePath);
        a.setAttribute("href", "javascript:void(0)");
      });
    }

    function reExecuteScripts() {
      const scripts = Array.from(document.querySelectorAll("script"));
      for (const oldScript of scripts) {
        const newScript = document.createElement("script");
        for (const attr of oldScript.attributes) newScript.setAttribute(attr.name, attr.value);
        newScript.textContent = oldScript.textContent;
        oldScript.replaceWith(newScript);
      }
    }

    function replayLifecycleEvents() {
      // Many site pages initialize controls on DOMContentLoaded.
      document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
      window.dispatchEvent(new Event("load"));
    }

    async function loadGameIframes() {
      const gameIframes = document.querySelectorAll('iframe[data-game-src]');
      for (const iframe of gameIframes) {
        try {
          const gameSrc = iframe.getAttribute("data-game-src");
          if (!gameSrc) continue;

          const res = await fetch(gameSrc, { cache: "no-cache" });
          if (!res.ok) continue;

          const html = await res.text();
          const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
          iframe.setAttribute("src", blobUrl);
          iframe.removeAttribute("data-game-src");

          // Clean up blob URL after some time
          setTimeout(() => URL.revokeObjectURL(blobUrl), 600000);
        } catch (err) {
          console.error("Failed to load game iframe:", err);
        }
      }
    }

    async function render(pathOrUrl) {
      const targetPath = normalizePath(toRepoPath(pathOrUrl) || START_PAGE) || START_PAGE;
      const url = toRepoUrl(targetPath);
      if (!url) throw new Error("Unable to resolve path: " + targetPath);

      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status + " for " + url);
      const htmlText = await res.text();

      const parser = new DOMParser();
      const newDoc = parser.parseFromString(htmlText, "text/html");
      await inlineStyles(newDoc, targetPath);
      await inlineScripts(newDoc, targetPath);
      rewriteAssets(newDoc, targetPath);

      document.documentElement.innerHTML = newDoc.documentElement.innerHTML;

      currentPagePath = targetPath;
      history.replaceState({ ghPath: targetPath }, "", "#" + targetPath);
      installNavigationHandlers();
      reExecuteScripts();
      replayLifecycleEvents();
      
      // Load game iframes after page render
      setTimeout(() => loadGameIframes(), 100);
      
      window.scrollTo(0, 0);
    }

    function extractButtonPath(el) {
      if (!el) return "";
      const candidate = el.getAttribute("data-gh-path") || el.getAttribute("data-href") || el.getAttribute("data-url") || el.getAttribute("formaction");
      if (candidate) return resolveRelativePath(currentPagePath, candidate);
      const onclick = el.getAttribute("onclick") || "";
      const locMatch = onclick.match(/(?:window\\.)?location(?:\\.href)?\\s*=\\s*['\"]([^'\"]+)['\"]/i);
      if (locMatch && locMatch[1]) return resolveRelativePath(currentPagePath, locMatch[1]);
      const openMatch = onclick.match(/window\\.open\\(\\s*['\"]([^'\"]+)['\"]/i);
      if (openMatch && openMatch[1]) return resolveRelativePath(currentPagePath, openMatch[1]);
      return "";
    }

    let navInstalled = false;
    function installNavigationHandlers() {
      if (navInstalled) return;
      navInstalled = true;

      document.addEventListener("click", (e) => {
        const a = e.target && e.target.closest ? e.target.closest("a[href], a[data-gh-path]") : null;
        const b = e.target && e.target.closest ? e.target.closest("button, input[type='button'], input[type='submit'], [data-href], [data-url]") : null;
        if (!a && !b) return;

        if (b && !a) {
          const p = extractButtonPath(b);
          if (!p) return;
          e.preventDefault();
          e.stopPropagation();
          render(p).catch((err) => console.error("Render failed:", err));
          return;
        }

        const rawHref = a.getAttribute("data-gh-path") || a.getAttribute("href") || "";
        if (!rawHref) return;

        // Keep in-page anchors/overlay triggers working without navigating to base/#.
        if (/^#/i.test(rawHref)) {
          e.preventDefault();
          return;
        }

        if (/^(javascript:|data:|mailto:|tel:)/i.test(rawHref)) return;

        const p = resolveRelativePath(currentPagePath, rawHref);
        if (!p) return;
        e.preventDefault();
        e.stopPropagation();
        render(p).catch((err) => console.error("Render failed:", err));
      }, true);

      window.addEventListener("hashchange", () => {
        const p = normalizePath((location.hash || "").replace(/^#/, "")) || START_PAGE;
        render(p).catch((err) => console.error("Render failed:", err));
      });
    }

    async function initStandalone() {
      const boot = document.getElementById("boot");
      try {
        if (boot) boot.textContent = "Loading manifest...";
        const res = await fetch(MANIFEST_URL, { cache: "no-cache" });
        if (!res.ok) throw new Error("Manifest HTTP " + res.status);
        const text = await res.text();

        text.split("\\n").forEach((line) => {
          const parts = line.trim().split("|").map((s) => s.trim());
          if (parts.length < 2) return;
          const path = parts[1].replace(/^\\/+/, "");
          const fullUrl = REPO_BASE + "/" + path;
          assetMap[path] = fullUrl;
          const baseName = path.split("/").pop();
          if (baseName && !assetMap[baseName]) assetMap[baseName] = fullUrl;
        });

        if (boot) boot.textContent = "Rendering page...";
        await render(START_PAGE);
      } catch (err) {
        if (boot) {
          boot.textContent = "Startup failed: " + (err && err.message ? err.message : String(err));
          boot.style.color = "#ff6b6b";
        }
        console.error("Standalone renderer failed:", err);
      }
    }

    initStandalone();
  })();
  <\/script>
</body>
</html>`;

    const blobUrl = URL.createObjectURL(new Blob([appHtml], { type: "text/html" }));

    // Some browsers return null when noopener is used, so keep this simple
    // and add a same-tab fallback if popups are truly blocked.
    const tab = window.open(blobUrl, "_blank");
    if (!tab) {
      console.warn("Popup blocked. Falling back to current tab.");
      window.location.href = blobUrl;
      return;
    }

    setTimeout(() => URL.revokeObjectURL(blobUrl), 300000);
  }

  function installClickInterceptor() {
    if (clickInterceptorInstalled) return;
    clickInterceptorInstalled = true;

    document.addEventListener(
      "click",
      (e) => {
        const anchor = e.target && e.target.closest ? e.target.closest("a[href], a[data-gh-path]") : null;
        const button = e.target && e.target.closest ? e.target.closest("button, input[type='button'], input[type='submit'], [data-href], [data-url]") : null;

        if (!anchor && !button) return;

        if (button && !anchor) {
          const targetPath = findButtonTargetPath(button);
          if (!targetPath) return;

          e.preventDefault();
          e.stopPropagation();

          const openInNewTab = button.getAttribute("data-open") === "new-tab" || button.getAttribute("target") === "_blank";
          if (openInNewTab) {
            openBlobTab(targetPath);
            return;
          }

          setRouteHash(targetPath);
          renderProjectPage(targetPath);
          return;
        }

        const dataPath = anchor.getAttribute("data-gh-path");
        const rawHref = anchor.getAttribute("href") || "";

        let targetPath = dataPath || "";
        if (!targetPath) {
          if (rawHref && rawHref.startsWith("#")) {
            e.preventDefault();
            return;
          }

          if (isSkippableHref(rawHref)) return;
          targetPath = resolveRelativePath(currentPagePath, rawHref);
          if (!targetPath) return;
        }

        e.preventDefault();
        e.stopPropagation();

        const openInNewTab = anchor.getAttribute("target") === "_blank" || anchor.getAttribute("data-open") === "new-tab";
        if (openInNewTab) {
          openBlobTab(targetPath);
          return;
        }

        setRouteHash(targetPath);
        renderProjectPage(targetPath);
      },
      true
    );
  }

  function patchWindowOpen() {
    if (windowOpenPatched) return;
    windowOpenPatched = true;

    const nativeOpen = window.open.bind(window);
    window.open = function patchedOpen(url, target, features) {
      const navPath = extractNavPath(url, currentPagePath);
      if (navPath) {
        if (target === "_blank") {
          openBlobTab(navPath);
          return null;
        }

        setRouteHash(navPath);
        renderProjectPage(navPath);
        return null;
      }

      return nativeOpen(url, target, features);
    };
  }

  function installHistoryHandler() {
    if (historyHandlerInstalled) return;
    historyHandlerInstalled = true;

    window.addEventListener("popstate", () => {
      const targetPath = getPathFromHash() || START_PAGE;
      renderProjectPage(targetPath);
    });

    window.addEventListener("hashchange", () => {
      const targetPath = getPathFromHash() || START_PAGE;
      renderProjectPage(targetPath);
    });
  }

  async function inlineStyles(newDoc, pagePath) {
    const links = Array.from(newDoc.querySelectorAll('link[rel="stylesheet"][href]'));

    for (const link of links) {
      try {
        const href = link.getAttribute("href");
        const cssPath = resolveRelativePath(pagePath, href);
        const cssUrl = toRepoUrl(cssPath);
        if (!cssUrl) continue;

        const cssRes = await fetch(cssUrl, { cache: "no-cache" });
        if (!cssRes.ok) continue;

        let css = await cssRes.text();

        css = css.replace(/url\(['"]?([^'")]+)['"]?\)/g, (match, path) => {
          if (/^(https?:|data:|blob:)/i.test(path)) return match;
          const assetPath = resolveRelativePath(cssPath || pagePath, path);
          const resolved = toRepoUrl(assetPath);
          return resolved ? 'url("' + resolved + '")' : match;
        });

        const style = document.createElement("style");
        style.textContent = css;
        link.replaceWith(style);
      } catch {
        console.warn("CSS load failed");
      }
    }
  }

  async function inlineScripts(newDoc, pagePath) {
    const scripts = Array.from(newDoc.querySelectorAll("script[src]"));

    for (const script of scripts) {
      try {
        const src = script.getAttribute("src");
        const scriptPath = resolveRelativePath(pagePath, src);
        const scriptUrl = toRepoUrl(scriptPath);
        if (!scriptUrl) continue;

        const jsRes = await fetch(scriptUrl, { cache: "no-cache" });
        if (!jsRes.ok) continue;

        const js = await jsRes.text();
        script.removeAttribute("src");
        script.textContent = js;
      } catch {
        console.warn("Script load failed");
      }
    }
  }

  function rewriteNonAnchorAssets(newDoc, pagePath) {
    newDoc.querySelectorAll("[src]").forEach((el) => {
      const src = el.getAttribute("src");
      if (!src || /^(https?:|data:|blob:)/i.test(src)) return;
      const srcPath = resolveRelativePath(pagePath, src);
      const resolved = toRepoUrl(srcPath);
      if (resolved) {
        // Mark iframes for special async loading to prevent raw file display
        if (el.tagName.toLowerCase() === "iframe") {
          el.setAttribute("data-game-src", resolved);
          el.setAttribute("src", "about:blank");
        } else {
          el.setAttribute("src", resolved);
        }
      }
    });

    newDoc.querySelectorAll("link[href]").forEach((el) => {
      if (el.matches('link[rel="stylesheet"]')) return;
      const href = el.getAttribute("href");
      if (!href || /^(https?:|data:|blob:|#|javascript:|mailto:|tel:)/i.test(href)) return;
      const hrefPath = resolveRelativePath(pagePath, href);
      const resolved = toRepoUrl(hrefPath);
      if (resolved) el.setAttribute("href", resolved);
    });
  }

  async function loadGameIframes() {
    const gameIframes = document.querySelectorAll('iframe[data-game-src]');
    for (const iframe of gameIframes) {
      try {
        const gameSrc = iframe.getAttribute("data-game-src");
        if (!gameSrc) continue;

        const res = await fetch(gameSrc, { cache: "no-cache" });
        if (!res.ok) continue;

        const html = await res.text();
        const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
        iframe.setAttribute("src", blobUrl);
        iframe.removeAttribute("data-game-src");

        // Clean up blob URL after some time
        setTimeout(() => URL.revokeObjectURL(blobUrl), 600000);
      } catch (err) {
        console.warn("Failed to load game iframe:", err);
      }
    }
  }

  function markAnchorsForInterception(newDoc, pagePath) {
    newDoc.querySelectorAll("a[href]").forEach((anchor) => {
      const rawHref = anchor.getAttribute("href");
      if (isSkippableHref(rawHref)) return;

      const repoPath = resolveRelativePath(pagePath, rawHref);
      if (!repoPath) return;

      anchor.setAttribute("data-gh-path", repoPath);

      // Prevent accidental browser navigation to raw URLs if interception misses.
      const lowerPath = repoPath.toLowerCase().split("?")[0].split("#")[0];
      if (lowerPath.endsWith(".html") || lowerPath.endsWith(".htm") || !lowerPath.includes(".")) {
        anchor.setAttribute("href", "javascript:void(0)");
      }
    });
  }

  async function loadGameIframes() {
    const gameIframes = document.querySelectorAll('iframe[data-game-src]');
    for (const iframe of gameIframes) {
      try {
        const gameSrc = iframe.getAttribute("data-game-src");
        if (!gameSrc) continue;

        const res = await fetch(gameSrc, { cache: "no-cache" });
        if (!res.ok) continue;

        const html = await res.text();
        const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
        iframe.setAttribute("src", blobUrl);
        iframe.removeAttribute("data-game-src");

        // Clean up blob URL after some time
        setTimeout(() => URL.revokeObjectURL(blobUrl), 600000);
      } catch (err) {
        console.warn("Failed to load game iframe:", err);
      }
    }
  }

  function reExecuteScripts() {
    const scripts = Array.from(document.querySelectorAll("script"));
    for (const oldScript of scripts) {
      const newScript = document.createElement("script");

      for (const attr of oldScript.attributes) {
        newScript.setAttribute(attr.name, attr.value);
      }

      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    }
  }

  function replayLifecycleEvents() {
    // Re-run DOM lifecycle hooks for pages that attach UI handlers at DOMContentLoaded.
    document.dispatchEvent(new Event("DOMContentLoaded", { bubbles: true }));
    window.dispatchEvent(new Event("load"));
  }

  async function renderProjectPage(targetPathOrUrl) {
    try {
      const targetPath = normalizePath(toRepoPath(targetPathOrUrl) || START_PAGE);
      const url = toRepoUrl(targetPath);
      if (!url) throw new Error("Unable to resolve target path: " + targetPath);

      console.log("[Live] Fetching:", url);
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);

      const htmlText = await res.text();
      const parser = new DOMParser();
      const newDoc = parser.parseFromString(htmlText, "text/html");

      await inlineStyles(newDoc, targetPath);
      await inlineScripts(newDoc, targetPath);
      rewriteNonAnchorAssets(newDoc, targetPath);
      markAnchorsForInterception(newDoc, targetPath);

      document.documentElement.innerHTML = newDoc.documentElement.innerHTML;

      const base = document.createElement("base");
      base.href = REPO_BASE + "/";
      document.head.appendChild(base);

      currentPagePath = targetPath;
      installClickInterceptor();
      installHistoryHandler();
      patchWindowOpen();
      reExecuteScripts();
      replayLifecycleEvents();
      
      // Load game iframes after page render
      setTimeout(() => loadGameIframes(), 100);
      
      window.scrollTo(0, 0);
    } catch (err) {
      console.error("Live render failed:", err);
    }
  }

  async function init() {
    if (isRunning) return;
    isRunning = true;

    try {
      // Open a standalone renderer tab so CSP on the current page cannot block fetch.
      launchStandaloneRendererTab(START_PAGE);
    } catch (e) {
      console.error("Manifest load failed:", e);
    } finally {
      isRunning = false;
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !isRunning) {
      const t = document.activeElement;
      if (!t || !/input|textarea/i.test(t.tagName)) {
        init();
      }
    }
  });

  console.log("This script is owned and managed by The G.GUI Project. To launch the GitHub Live Renderer, press Enter on an empty area of the page. For more info, join the discord: https://discord.gg/XEqNzcx6jp");
})();
