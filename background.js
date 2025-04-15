// Настройки по умолчанию с предустановленными значениями

const defaultSettings = {
  faviconEnabled: true,
  urlParamEnabled: true,
  reactToggleValue: false,
  autoUpdateEnabled: false,
  autoUpdateMode: 'current',
  faviconMappings: {
    "https://laravel6.usedesk.ru/": "icons/favicon_laravel6.png",
    "https://devsecure.usedesk.ru/": "icons/favicon_devsecure.png",
    "https://secure.usedesk.ru/": "icons/favicon_prod.png"
  },
  // Домены, на которых активна функция добавления параметра
  activeDomains: [
    "https://laravel6.usedesk.ru/",
    "https://devsecure.usedesk.ru/",
    "https://secure.usedesk.ru/"
  ],
  // Пути, для которых нужно добавлять параметр
  urlPatterns: [
    "/tickets/",
    "/chat"
  ]
};

// Загрузка настроек при запуске
let settings = defaultSettings;
chrome.storage.sync.get('settings', (data) => {
  if (data.settings) {
    // Объединяем значения из хранилища с дефолтными, сохраняя предустановленные значения
    settings = {
      ...defaultSettings,
      faviconEnabled: data.settings.faviconEnabled !== undefined ? data.settings.faviconEnabled : defaultSettings.faviconEnabled,
      urlParamEnabled: data.settings.urlParamEnabled !== undefined ? data.settings.urlParamEnabled : defaultSettings.urlParamEnabled,
      reactToggleValue: data.settings.reactToggleValue !== undefined ? data.settings.reactToggleValue : defaultSettings.reactToggleValue,
      activeDomains: data.settings.activeDomains || defaultSettings.activeDomains,
      autoUpdateEnabled: data.settings.autoUpdateEnabled !== undefined ? data.settings.autoUpdateEnabled : defaultSettings.autoUpdateEnabled,
      autoUpdateMode: data.settings.autoUpdateMode || defaultSettings.autoUpdateMode
    };
  } else {
    chrome.storage.sync.set({ settings });
  }
});

// Обновляем обработчик изменений настроек
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings) {
    const oldSettings = settings;
    
    // Обновляем текущие настройки
    settings = {
      ...defaultSettings,
      faviconEnabled: changes.settings.newValue.faviconEnabled,
      urlParamEnabled: changes.settings.newValue.urlParamEnabled,
      reactToggleValue: changes.settings.newValue.reactToggleValue,
      activeDomains: changes.settings.newValue.activeDomains || defaultSettings.activeDomains,
      autoUpdateEnabled: changes.settings.newValue.autoUpdateEnabled,
      autoUpdateMode: changes.settings.newValue.autoUpdateMode
    };
    
    // Проверяем, изменилось ли значение reactToggleValue
    const toggleValueChanged = oldSettings.reactToggleValue !== settings.reactToggleValue;
    
    // Если автообновление включено и значение переключателя изменилось
    if (settings.autoUpdateEnabled && toggleValueChanged) {
      if (settings.autoUpdateMode === 'current') {
        // Обновляем только текущую вкладку
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs.length > 0) {
            updateTab(tabs[0]);
          }
        });
      } else {
        // Обновляем все вкладки
        updateOpenTabs();
      }
    }
  }
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
    return urlObj.hostname.endsWith('.usedesk.ru');
  } catch (e) {
    console.error('Ошибка при проверке разрешений URL:', e);
    return false;
  }
}

// Обновляем функцию изменения favicon
function changeFavicon(tabId, url) {
  if (!settings.faviconEnabled) return;
  
  // Проверяем разрешения перед попыткой внедрения
  if (!hasPermissionForUrl(url)) {
    console.log(`Нет разрешения для изменения favicon на: ${url}`);
    return;
  }
  
  // Определяем какой favicon нужно установить
  let faviconPath = null;
  
  // Проверяем каждый домен из нашей карты маппингов
  for (const domain in settings.faviconMappings) {
    if (url.startsWith(domain)) {
      faviconPath = settings.faviconMappings[domain];
      console.log(`Найдено соответствие для URL ${url}, использую фавикон: ${faviconPath}`);
      break;
    }
  }
  
  // Если нашли подходящий favicon
  if (faviconPath) {
    try {
      // Получаем полный URL к локальному файлу в расширении
      const newFaviconUrl = chrome.runtime.getURL(faviconPath);
      console.log(`Полный URL фавикона: ${newFaviconUrl}`);
      
      // Используем chrome.scripting.executeScript для внедрения скрипта
      chrome.scripting.executeScript({
        target: { tabId },
        func: function(iconUrl) {
          console.log('Запущен скрипт замены фавикона');
          
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
              console.log('Фавикон успешно заменен на:', iconUrl);
            } catch (err) {
              console.error('Ошибка при замене фавикона:', err);
            }
          }
          
          // Пробуем заменить сразу и через секунду (для надежности)
          tryReplaceFavicon();
          setTimeout(tryReplaceFavicon, 1000);
        },
        args: [newFaviconUrl]
      }).catch(err => {
        console.error('Ошибка при выполнении скрипта:', err);
      });
    } catch (err) {
      console.error('Общая ошибка в changeFavicon:', err);
    }
  }
}

// Функция для проверки, нужно ли добавлять параметр
function shouldAddReactToggle(url) {
  if (!settings.urlParamEnabled) return false;
  
  try {
    const urlObj = new URL(url);
    
    // Если URL уже содержит параметр react_toggle, не нужно добавлять
    if (urlObj.searchParams.has('react_toggle')) {
      return false;
    }
    
    // Проверяем, относится ли URL к активным доменам
    const isActiveDomain = settings.activeDomains.some(domain => 
      url.startsWith(domain)
    );
    
    if (!isActiveDomain) return false;
    
    // Проверяем, содержит ли URL один из шаблонов путей
    const hasMatchingPattern = settings.urlPatterns.some(pattern => 
      urlObj.pathname.includes(pattern)
    );
    
    return hasMatchingPattern;
  } catch (e) {
    console.error('Ошибка при проверке URL:', e);
    return false;
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
    console.error('Ошибка при модификации URL:', e);
    return url;
  }
}

// Обновляем функцию внедрения обработчика кликов
function injectClickHandler(tabId) {
  if (!settings.urlParamEnabled) return;
  
  // Получаем URL текущей вкладки перед внедрением обработчика
  chrome.tabs.get(tabId, function(tab) {
    if (chrome.runtime.lastError) {
      console.error('Ошибка при получении информации о вкладке:', chrome.runtime.lastError.message);
      return;
    }
    
    // Проверяем разрешения для URL
    if (!hasPermissionForUrl(tab.url)) {
      console.log(`Нет разрешения для внедрения обработчика на: ${tab.url}`);
      return;
    }
    
    // Продолжаем внедрение обработчика
    chrome.scripting.executeScript({
      target: { tabId },
      func: function() {
        // Предотвращаем повторную инъекцию
        if (window.__reactToggleHandlerInjected) return;
        window.__reactToggleHandlerInjected = true;
        
        console.log('Внедряем обработчик кликов для модификации ссылок');
        
        // Функция для обработки всех ссылок на странице
        function processAllLinks() {
          try {
            // Получаем все ссылки на странице
            const links = document.querySelectorAll('a[href]');
            
            links.forEach(link => {
              const href = link.getAttribute('href');
              if (!href) return;
              
              // Проверяем через скрытый параметр, была ли ссылка уже обработана
              if (link.__reactToggleProcessed) return;
              link.__reactToggleProcessed = true;
              
              // Отправляем сообщение в фоновый скрипт для проверки
              chrome.runtime.sendMessage({
                action: 'checkUrl',
                url: href,
                baseUrl: window.location.origin
              });
            });
          } catch (e) {
            console.error('Ошибка при обработке ссылок:', e);
          }
        }
        
        // Обрабатываем все ссылки при загрузке
        processAllLinks();
        
        // Используем MutationObserver для отслеживания новых ссылок
        const observer = new MutationObserver(mutations => {
          mutations.forEach(mutation => {
            if (mutation.addedNodes && mutation.addedNodes.length > 0) {
              processAllLinks();
            }
          });
        });
        
        // Запускаем наблюдатель
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
        
        // Обработчик для отслеживания кликов
        document.addEventListener('click', function(e) {
          // Находим ближайший родительский элемент <a>
          let el = e.target;
          while (el && el.tagName !== 'A') {
            el = el.parentElement;
            if (!el) return;
          }
          
          // Если это не ссылка, выходим
          if (!el) return;
          
          // Получаем href ссылки
          const href = el.getAttribute('href');
          if (!href) return;
          
          // Отправляем сообщение в фоновый скрипт с URL для проверки
          chrome.runtime.sendMessage({
            action: 'checkUrl',
            url: href,
            baseUrl: window.location.origin
          });
        }, true);
        
        // Прослушиваем сообщения от фонового скрипта
        chrome.runtime.onMessage.addListener((message) => {
          if (message.action === 'modifyUrl' && message.url) {
            // Находим все ссылки с указанным URL
            const links = document.querySelectorAll(`a[href="${message.originalUrl}"]`);
            links.forEach(link => {
              link.setAttribute('href', message.url);
            });
          }
        });
      }
    }).catch(err => {
      console.error('Ошибка при внедрении обработчика кликов:', err);
    });
  });
}

// Добавляем слушателя для сообщений от popup.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Обработка сообщений от контентного скрипта (существующий код)
  if (message.action === 'checkUrl') {
    let fullUrl = message.url;
    
    // Если URL относительный, добавляем базовый URL
    if (!fullUrl.startsWith('http')) {
      fullUrl = message.baseUrl + (fullUrl.startsWith('/') ? '' : '/') + fullUrl;
    }
    
    // Проверяем, нужно ли добавлять параметр
    if (shouldAddReactToggle(fullUrl)) {
      const modifiedUrl = addReactToggleToUrl(fullUrl);
      
      // Отправляем обратно контентному скрипту модифицированный URL
      chrome.tabs.sendMessage(sender.tab.id, {
        action: 'modifyUrl',
        originalUrl: message.url,
        url: modifiedUrl
      });
    }
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
  if (!tab.url || !hasPermissionForUrl(tab.url)) {
    console.log(`Пропускаем обработку для URL без разрешений: ${tab.url}`);
    return;
  }
  
  try {
    const url = new URL(tab.url);
    
    // Проверяем, относится ли URL к активным доменам
    const isActiveDomain = settings.activeDomains.some(domain => 
      tab.url.startsWith(domain)
    );
    
    if (!isActiveDomain) {
      console.log(`URL не относится к активным доменам: ${tab.url}`);
      return;
    }
    
    // Проверяем, содержит ли URL один из шаблонов путей
    const hasMatchingPattern = settings.urlPatterns.some(pattern => 
      url.pathname.includes(pattern)
    );
    
    if (!hasMatchingPattern) {
      console.log(`URL не соответствует шаблонам путей: ${tab.url}`);
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
        
        console.log(`Обновляем URL вкладки после нажатия кнопки: ${tab.url} -> ${newUrl}`);
        
        // Обновляем URL вкладки
        chrome.tabs.update(tab.id, { url: newUrl });
      } else {
        console.log(`Параметр уже имеет нужное значение: ${tab.url}`);
      }
    } 
    // Если страница не содержит параметр, но функция включена
    else if (settings.urlParamEnabled) {
      const newUrl = addReactToggleToUrl(tab.url);
      
      console.log(`Добавляем параметр к URL после нажатия кнопки: ${tab.url} -> ${newUrl}`);
      
      // Обновляем URL вкладки
      chrome.tabs.update(tab.id, { url: newUrl });
    } else {
      console.log(`Не требуются изменения для URL: ${tab.url}`);
    }
  } catch (e) {
    console.error('Ошибка при обновлении вкладки:', e);
  }
}

// Обновляем обработчик событий загрузки страницы
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Проверяем разрешения перед выполнением действий
    if (!hasPermissionForUrl(tab.url)) {
      console.log(`Пропускаем обработку для URL без разрешений: ${tab.url}`);
      return;
    }
    
    // Заменяем favicon
    changeFavicon(tabId, tab.url);
    setTimeout(() => changeFavicon(tabId, tab.url), 1500);
    
    // Внедряем обработчик кликов
    injectClickHandler(tabId);
    
    try {
      const urlObj = new URL(tab.url);
      const urlWithoutParams = urlObj.origin + urlObj.pathname;
      
      // Если нужно добавить параметр и страница не была недавно модифицирована
      if (shouldAddReactToggle(tab.url) && !wasRecentlyModified(urlWithoutParams)) {
        console.log(`Добавляем параметр к URL: ${tab.url}`);
        const modifiedUrl = addReactToggleToUrl(tab.url);
        
        // Отмечаем URL как модифицированный для предотвращения циклов
        markAsModified(urlWithoutParams);
        
        // Обновляем URL вкладки
        chrome.tabs.update(tabId, { url: modifiedUrl });
      }
    } catch (e) {
      console.error('Ошибка при обработке URL в onUpdated:', e);
    }
  }
});

// Аналогично обновляем обработчик изменений истории URL
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId === 0) {
    // Проверяем разрешения перед выполнением действий
    if (!hasPermissionForUrl(details.url)) {
      console.log(`Пропускаем обработку изменений истории для URL без разрешений: ${details.url}`);
      return;
    }
    
    // Заменяем favicon
    changeFavicon(details.tabId, details.url);
    
    try {
      const urlObj = new URL(details.url);
      const urlWithoutParams = urlObj.origin + urlObj.pathname;
      
      // Если нужно добавить параметр и страница не была недавно модифицирована
      if (shouldAddReactToggle(details.url) && !wasRecentlyModified(urlWithoutParams)) {
        console.log(`Добавляем параметр к URL при изменении истории: ${details.url}`);
        const modifiedUrl = addReactToggleToUrl(details.url);
        
        // Отмечаем URL как модифицированный для предотвращения циклов
        markAsModified(urlWithoutParams);
        
        // Обновляем URL вкладки
        chrome.tabs.update(details.tabId, { url: modifiedUrl });
      }
    } catch (e) {
      console.error('Ошибка при обработке URL в onHistoryStateUpdated:', e);
    }
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
        
        // Проверяем, содержит ли URL один из шаблонов путей
        const hasMatchingPattern = settings.urlPatterns.some(pattern => 
          url.pathname.includes(pattern)
        );
        
        if (!hasMatchingPattern) {
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
            
            console.log(`Обновляем URL вкладки после изменения настроек: ${tab.url} -> ${newUrl}`);
            
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
            
            console.log(`Добавляем параметр к URL после включения функции: ${tab.url} -> ${newUrl}`);
            
            // Отмечаем URL как модифицированный
            markAsModified(urlWithoutParams);
            
            // Обновляем URL вкладки
            chrome.tabs.update(tab.id, { url: newUrl });
          }
        }
      } catch (e) {
        console.error('Ошибка при обновлении вкладки:', e);
      }
    });
  });
} 