// Настройки по умолчанию с предустановленными значениями

const defaultSettings = {
  faviconEnabled: true,
  urlParamEnabled: true,
  reactToggleValue: false,
  autoUpdateEnabled: false,
  autoUpdateMode: 'current',
  faviconMappings: {
    "https://laravel6.usedesk.ru/": "icons/favicon_laravel6.png",
    "https://secure-preprod.usedesk.dev/": "icons/favicon_devsecure.png",
    "https://secure.usedesk.ru/": "icons/favicon_prod.png"
  },
  // Домены, на которых активна функция добавления параметра
  activeDomains: [
    "https://laravel6.usedesk.ru/",
    "https://secure-preprod.usedesk.dev/",
    "https://secure.usedesk.ru/"
  ],
  // Пути, для которых нужно добавлять параметр
  urlPatterns: [
    "/tickets/",
    "/chat"
  ]
};

const LEGACY_DEVSECURE = "https://devsecure.usedesk.ru/";
const SECURE_PREPROD = "https://secure-preprod.usedesk.dev/";

function normalizeSettings(raw) {
  const merged = {
    ...defaultSettings,
    ...(raw || {})
  };

  // Приводим домены и маппинги к актуальному стенду (миграция с devsecure.usedesk.ru)
  if (Array.isArray(merged.activeDomains)) {
    const nextDomains = merged.activeDomains.map(d => (d === LEGACY_DEVSECURE ? SECURE_PREPROD : d));
    merged.activeDomains = Array.from(new Set(nextDomains));
  } else {
    merged.activeDomains = [...defaultSettings.activeDomains];
  }

  if (merged.faviconMappings && typeof merged.faviconMappings === 'object') {
    if (merged.faviconMappings[LEGACY_DEVSECURE] && !merged.faviconMappings[SECURE_PREPROD]) {
      merged.faviconMappings[SECURE_PREPROD] = merged.faviconMappings[LEGACY_DEVSECURE];
    }
    if (merged.faviconMappings[LEGACY_DEVSECURE]) {
      delete merged.faviconMappings[LEGACY_DEVSECURE];
    }
  } else {
    merged.faviconMappings = { ...defaultSettings.faviconMappings };
  }

  // Уважим выключение параметра, даже если urlPatterns остались от старой версии
  if (!Array.isArray(merged.urlPatterns)) {
    merged.urlPatterns = [...defaultSettings.urlPatterns];
  }

  return merged;
}

// Загрузка настроек при запуске (с миграцией)
let settings = { ...defaultSettings };
chrome.storage.sync.get('settings', (data) => {
  const raw = data && data.settings ? data.settings : null;
  const normalized = normalizeSettings(raw);
  settings = normalized;
  if (!raw || JSON.stringify(raw) !== JSON.stringify(normalized)) {
    chrome.storage.sync.set({ settings: normalized });
  }
  updateDnrRulesFromSettings();
});

// Добавляем механизм защиты от бесконечных циклов
let recentlyModifiedUrls = {};

// Проверяем, был ли URL недавно модифицирован
function wasRecentlyModified(url) {
  const now = Date.now();
  
  // Очищаем старые записи (старше 5 секунд)
  Object.keys(recentlyModifiedUrls).forEach(key => {
    if (now - recentlyModifiedUrls[key] > 5000) {
      delete recentlyModifiedUrls[key];
    }
  });
  
  // Проверяем, была ли эта страница недавно модифицирована
  return recentlyModifiedUrls[url] !== undefined;
}

// Отмечаем URL как недавно модифицированный
function markAsModified(url) {
  recentlyModifiedUrls[url] = Date.now();
}

// Функция для проверки, имеет ли расширение разрешение на доступ к URL
function hasPermissionForUrl(url) {
  try {
    const urlObj = new URL(url);
    // Проверяем, соответствует ли домен нашему разрешению
    return urlObj.hostname.endsWith('.usedesk.ru') || urlObj.hostname.endsWith('.usedesk.dev');
  } catch (e) {
    return false;
  }
}

// Обновляем функцию изменения favicon
function changeFavicon(tabId, url) {
  if (!settings.faviconEnabled) return;
  
  // Проверяем разрешения перед попыткой внедрения
  if (!hasPermissionForUrl(url)) {
    return;
  }
  
  // Определяем какой favicon нужно установить
  let faviconPath = null;
  
  // Проверяем каждый домен из нашей карты маппингов
  for (const domain in settings.faviconMappings) {
    if (url.startsWith(domain)) {
      faviconPath = settings.faviconMappings[domain];
      break;
    }
  }
  
  // Если нашли подходящий favicon
  if (faviconPath) {
    try {
      // Получаем полный URL к локальному файлу в расширении
      const newFaviconUrl = chrome.runtime.getURL(faviconPath);
      
      // Используем chrome.scripting.executeScript для внедрения скрипта
      chrome.scripting.executeScript({
        target: { tabId },
        func: function(iconUrl) {
          // Функция для повторных попыток замены
          function tryReplaceFavicon() {
            try {
              // Удаляем все существующие фавиконы
              const existingIcons = document.querySelectorAll("link[rel*='icon']");
              existingIcons.forEach(icon => icon.parentNode.removeChild(icon));
              
              // Создаем новый элемент link для фавикона
              const link = document.createElement('link');
              link.type = 'image/png';
              link.rel = 'icon';
              link.href = iconUrl;
              
              // Добавляем элемент в head
              document.head.appendChild(link);
            } catch (err) {
              // Ошибка при замене фавикона
            }
          }
          
          // Пробуем заменить сразу и через секунду (для надежности)
          tryReplaceFavicon();
          setTimeout(tryReplaceFavicon, 1000);
        },
        args: [newFaviconUrl]
      }).catch(err => {
        // Ошибка при выполнении скрипта
      });
    } catch (err) {
      // Общая ошибка в changeFavicon
    }
  }
}

// Функция для добавления параметра в URL
function addReactToggleToUrl(url) {
  try {
    const urlObj = new URL(url);
    
    // Устанавливаем параметр react_toggle в зависимости от настройки
    urlObj.searchParams.set('react_toggle', settings.reactToggleValue ? '1' : '0');
    
    return urlObj.href;
  } catch (e) {
    return url;
  }
}

function matchesReactTogglePath(pathname) {
  if (!pathname) return false;

  // /tickets (список) и /tickets/{id} (детальная)
  if (pathname === '/tickets' || pathname === '/tickets/') return true;
  if (/^\/tickets\/\d+\/?$/.test(pathname)) return true;

  // /chat (+ вложенные)
  if (pathname === '/chat' || pathname.startsWith('/chat/')) return true;

  return false;
}

// Функция генерации и применения правил DNR для добавления react_toggle до загрузки
async function updateDnrRulesFromSettings() {
  try {
    // Если функция отключена, очищаем правила
    if (!settings.urlParamEnabled) {
      const existing = await chrome.declarativeNetRequest.getDynamicRules();
      const removeIds = existing.map(r => r.id);
      if (removeIds.length) {
        await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds, addRules: [] });
      }
      return;
    }

    // Строим набор правил по активным доменам
    const addRules = [];
    const desiredValue = settings.reactToggleValue ? '1' : '0';
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeIds = existing.map(r => r.id);

    let ruleId = 1000;
    const activeDomains = Array.isArray(settings.activeDomains) ? settings.activeDomains : [];

    activeDomains.forEach(domainUrl => {
      try {
        const hostname = new URL(domainUrl).hostname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // /tickets (список) и /tickets/{id} (детальная), + /chat
        const regexTickets = `^https?://${hostname}/tickets(?:/\\d+)?/?(?:$|\\?.*)`;
        const regexChat = `^https?://${hostname}/chat(?:/.*)?(?:$|\\?.*)`;
        addRules.push({
          id: ++ruleId,
          priority: 1,
          action: {
            type: 'redirect',
            redirect: {
              transform: {
                queryTransform: {
                  addOrReplaceParams: [{ key: 'react_toggle', value: desiredValue }]
                }
              }
            }
          },
          condition: {
            regexFilter: regexTickets,
            resourceTypes: ['main_frame']
          }
        });

        addRules.push({
          id: ++ruleId,
          priority: 1,
          action: {
            type: 'redirect',
            redirect: {
              transform: {
                queryTransform: {
                  addOrReplaceParams: [{ key: 'react_toggle', value: desiredValue }]
                }
              }
            }
          },
          condition: {
            regexFilter: regexChat,
            resourceTypes: ['main_frame']
          }
        });
      } catch (_) { }
    });

    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: removeIds, addRules });
  } catch (_) { }
}

// Обновляем правила и поведение при изменении настроек
chrome.storage.onChanged.addListener((changes) => {
  if (!changes.settings) return;

  const oldSettings = settings;
  settings = normalizeSettings(changes.settings.newValue);

  // Проверяем, изменилось ли значение reactToggleValue
  const toggleValueChanged = oldSettings.reactToggleValue !== settings.reactToggleValue;

  // Применяем правила DNR при изменении настроек
  updateDnrRulesFromSettings().then(() => {
    // Мгновенно применяем изменение на активной вкладке через контент-скрипт без перезагрузки
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'applyDesignNow' });
      }
    });
  });

  // Если автообновление включено и значение переключателя изменилось
  if (settings.autoUpdateEnabled && toggleValueChanged) {
    if (settings.autoUpdateMode === 'current') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length > 0) updateTab(tabs[0]);
      });
    } else {
      updateOpenTabs();
    }
  }
});

// Отключаем late-injection: редирект/параметр ставим до загрузки через DNR и в content.js для SPA

// Добавляем слушателя для сообщений от popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Установить дизайн и перезагрузить текущую вкладку (жестко)
  if (message.action === 'setDesignAndReloadCurrent') {
    chrome.storage.sync.get('settings', (data) => {
      const current = data.settings || { ...defaultSettings };
      current.reactToggleValue = !!message.value;
      chrome.storage.sync.set({ settings: current }, () => {
        updateDnrRulesFromSettings().then(() => {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0] && tabs[0].url && hasPermissionForUrl(tabs[0].url)) {
              const desiredUrl = addReactToggleToUrl(tabs[0].url);
              try {
                const curr = new URL(tabs[0].url);
                const desired = new URL(desiredUrl);
                const same = curr.href === desired.href;
                if (!same) {
                  chrome.tabs.update(tabs[0].id, { url: desired.href });
                } else {
                  chrome.tabs.reload(tabs[0].id);
                }
              } catch (_) {
                chrome.tabs.reload(tabs[0].id);
              }
            }
          });
        });
      });
    });
  }
  
  // Новый код для обработки кнопки "Обновить текущую вкладку"
  else if (message.action === 'updateCurrentTab') {
    // Получаем активную вкладку
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        updateTab(tabs[0]);
      }
    });
  }
  
  // Новый код для обработки кнопки "Обновить все вкладки"
  else if (message.action === 'updateAllTabs') {
    updateOpenTabs();
  }
});

// Функция обновления одной вкладки
function updateTab(tab) {
  // Проверяем разрешения для URL
  if (!hasPermissionForUrl(tab.url)) {
    return;
  }
  
  try {
    const url = new URL(tab.url);
    
    // Проверяем, относится ли URL к активным доменам
    const isActiveDomain = settings.activeDomains.some(domain => 
      tab.url.startsWith(domain)
    );
    
    if (!isActiveDomain) {
      return;
    }
    
    // Проверяем, относится ли страница к зоне действия react_toggle
    if (!matchesReactTogglePath(url.pathname)) {
      return;
    }
    
    // Если страница содержит параметр react_toggle
    if (url.searchParams.has('react_toggle')) {
      const currentValue = url.searchParams.get('react_toggle');
      const newValue = settings.reactToggleValue ? '1' : '0';
      
      // Если значение изменилось или функция была выключена
      if (currentValue !== newValue || !settings.urlParamEnabled) {
        let newUrl;
        
        if (settings.urlParamEnabled) {
          // Если функция включена, обновляем значение параметра
          url.searchParams.set('react_toggle', newValue);
          newUrl = url.href;
        } else {
          // Если функция выключена, удаляем параметр
          url.searchParams.delete('react_toggle');
          newUrl = url.href;
        }
        
        // Обновляем URL вкладки
        chrome.tabs.update(tab.id, { url: newUrl });
      }
    } 
    // Если страница не содержит параметр, но функция включена
    else if (settings.urlParamEnabled) {
      const newUrl = addReactToggleToUrl(tab.url);
      
      // Обновляем URL вкладки
      chrome.tabs.update(tab.id, { url: newUrl });
    }
  } catch (e) {
    // Ошибка при обновлении вкладки
  }
}

// Обновляем обработчик событий загрузки страницы
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Проверяем разрешения перед выполнением действий
    if (!hasPermissionForUrl(tab.url)) {
      return;
    }
    
    // Обновляем только favicon
    changeFavicon(tabId, tab.url);
    setTimeout(() => changeFavicon(tabId, tab.url), 1500);

    // Ранее здесь была логика добавления параметра и инъекций — удалена
  }
});

// Аналогично обновляем обработчик изменений истории URL — только favicon
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0) {
    // Проверяем разрешения перед выполнением действий
    if (!hasPermissionForUrl(details.url)) {
      return;
    }
    
    // Заменяем favicon
    changeFavicon(details.tabId, details.url);
    
    // Ранее здесь была логика добавления параметра и инъекций — удалена
  }
});

// Функция для обновления открытых вкладок с новым значением параметра
function updateOpenTabs() {
  // Получаем все открытые вкладки
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (!tab.url || !hasPermissionForUrl(tab.url)) {
        return; // Пропускаем вкладки без URL или без разрешений
      }
      
      try {
        const url = new URL(tab.url);
        
        // Проверяем, относится ли URL к активным доменам
        const isActiveDomain = settings.activeDomains.some(domain => 
          tab.url.startsWith(domain)
        );
        
        if (!isActiveDomain) {
          return; // Пропускаем неактивные домены
        }
        
        // Проверяем, относится ли страница к зоне действия react_toggle
        if (!matchesReactTogglePath(url.pathname)) {
          return; // Пропускаем URL, не соответствующие шаблонам
        }
        
        // Если страница содержит параметр react_toggle
        if (url.searchParams.has('react_toggle')) {
          const currentValue = url.searchParams.get('react_toggle');
          const newValue = settings.reactToggleValue ? '1' : '0';
          
          // Если значение изменилось или функция была выключена
          if (currentValue !== newValue || !settings.urlParamEnabled) {
            let newUrl;
            
            if (settings.urlParamEnabled) {
              // Если функция включена, обновляем значение параметра
              url.searchParams.set('react_toggle', newValue);
              newUrl = url.href;
            } else {
              // Если функция выключена, удаляем параметр
              url.searchParams.delete('react_toggle');
              newUrl = url.href;
            }
            
            // Отмечаем URL как модифицированный для предотвращения циклов
            const urlWithoutParams = url.origin + url.pathname;
            markAsModified(urlWithoutParams);
            
            // Обновляем URL вкладки
            chrome.tabs.update(tab.id, { url: newUrl });
          }
        } 
        // Если страница не содержит параметр, но функция включена
        else if (settings.urlParamEnabled) {
          const urlWithoutParams = url.origin + url.pathname;
          
          // Проверяем, не был ли URL недавно модифицирован
          if (!wasRecentlyModified(urlWithoutParams)) {
            const newUrl = addReactToggleToUrl(tab.url);
            
            // Отмечаем URL как модифицированный
            markAsModified(urlWithoutParams);
            
            // Обновляем URL вкладки
            chrome.tabs.update(tab.id, { url: newUrl });
          }
        }
      } catch (e) {
        // Ошибка при обновлении вкладки
      }
    });
  });
} 