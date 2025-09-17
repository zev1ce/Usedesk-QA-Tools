(function() {
  // Ранний гейт, чтобы не плодить лишние слушатели
  if (window.__usedeskReactParamGuard) return;
  window.__usedeskReactParamGuard = true;

  let settingsCache = null;

  function fetchSettings(cb) {
    try {
      chrome.storage.sync.get('settings', (data) => {
        settingsCache = data && data.settings ? data.settings : null;
        cb && cb(settingsCache);
      });
    } catch (_) {
      cb && cb(null);
    }
  }

  function isApplicableUrl(url) {
    try {
      const u = new URL(url);
      if (!settingsCache || !settingsCache.urlParamEnabled) return false;
      // Домен
      const isActive = (settingsCache.activeDomains || []).some(d => url.startsWith(d));
      if (!isActive) return false;
      // Путь
      const path = u.pathname;
      const matchesTickets = /\/tickets\/(\d+)$/.test(path);
      const matchesChat = /\/chat(\/.*)?$/.test(path);
      return matchesTickets || matchesChat;
    } catch (_) {
      return false;
    }
  }

  function ensureParamValue(url) {
    try {
      const u = new URL(url);
      const desired = settingsCache && settingsCache.reactToggleValue ? '1' : '0';
      const current = u.searchParams.get('react_toggle');
      if (current !== desired) {
        u.searchParams.set('react_toggle', desired);
        return u.href;
      }
      return null; // уже корректно
    } catch (_) {
      return null;
    }
  }

  function maybeFixLocation() {
    const href = location.href;
    if (!isApplicableUrl(href)) return;
    const next = ensureParamValue(href);
    if (next && next !== href) {
      history.replaceState(history.state, document.title, next);
    }
  }

  function toAbsolute(url) {
    try {
      return new URL(url, location.href).href;
    } catch (_) {
      return null;
    }
  }

  function toSameOriginPath(absoluteUrl) {
    try {
      const u = new URL(absoluteUrl);
      return u.pathname + u.search + u.hash;
    } catch (_) {
      return null;
    }
  }

  // Инициализация
  fetchSettings(() => {
    // Стартовая проверка для первой загрузки
    maybeFixLocation();

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(state, title, url) {
      let nextUrlArg = url;
      try {
        const abs = url ? toAbsolute(url) : location.href;
        if (abs && isApplicableUrl(abs)) {
          const fixed = ensureParamValue(abs);
          if (fixed) {
            // Передаем относительный путь, чтобы не нарушать same-origin требования
            const path = toSameOriginPath(fixed);
            if (path) nextUrlArg = path;
          }
        }
      } catch (_) {}
      return originalPushState.call(history, state, title, nextUrlArg);
    };

    history.replaceState = function(state, title, url) {
      let nextUrlArg = url;
      try {
        const abs = url ? toAbsolute(url) : location.href;
        if (abs && isApplicableUrl(abs)) {
          const fixed = ensureParamValue(abs);
          if (fixed) {
            const path = toSameOriginPath(fixed);
            if (path) nextUrlArg = path;
          }
        }
      } catch (_) {}
      return originalReplaceState.call(history, state, title, nextUrlArg);
    };

    window.addEventListener('popstate', () => {
      // После back/forward убедимся, что параметр корректный
      maybeFixLocation();
    });

    // На случай если настройки поменялись во время работы страницы
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.settings) {
        settingsCache = changes.settings.newValue || settingsCache;
        // При смене дизайна корректируем текущий URL немедленно
        maybeFixLocation();
      }
    });

    // Также слушаем команды из popup для мгновенного применения
    chrome.runtime.onMessage.addListener((message) => {
      if (message && message.action === 'applyDesignNow') {
        maybeFixLocation();
      }
    });
  });
})();
