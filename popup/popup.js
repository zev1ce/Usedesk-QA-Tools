// Получаем элементы управления
const faviconToggle = document.getElementById('favicon-toggle');
const urlParamToggle = document.getElementById('url-param-toggle');
const reactToggleValue = document.getElementById('react-toggle-value');
const oldDesignButton = document.getElementById('old-design-button');
const newDesignButton = document.getElementById('new-design-button');
const domainCheckboxes = document.querySelectorAll('input[name="domain"]');
const reactToggleSettings = document.getElementById('react-toggle-settings');
const updateCurrentTabBtn = document.getElementById('update-current-tab');
const updateAllTabsBtn = document.getElementById('update-all-tabs');
const autoUpdateToggle = document.getElementById('auto-update-toggle');
const autoUpdateModeDiv = document.getElementById('auto-update-mode');
const currentTabMode = document.getElementById('current-tab-mode');
const allTabsMode = document.getElementById('all-tabs-mode');

// Вспомогательная функция выставления активной кнопки
function setDesignButtons(isNew) {
  if (isNew) {
    newDesignButton.classList.add('active');
    oldDesignButton.classList.remove('active');
    reactToggleValue.value = "1";
  } else {
    oldDesignButton.classList.add('active');
    newDesignButton.classList.remove('active');
    reactToggleValue.value = "0";
  }
}

// Функция для получения выбранных доменов из чекбоксов
function getSelectedDomains() {
  return Array.from(domainCheckboxes)
    .filter(checkbox => checkbox.checked)
    .map(checkbox => checkbox.value);
}

// Функция для обновления видимости и доступности настроек
function updateSettingsVisibility() {
  // Показываем/скрываем настройки react_toggle
  reactToggleSettings.style.display = urlParamToggle.checked ? 'block' : 'none';
  
  // Показываем/скрываем настройки режима автообновления
  autoUpdateModeDiv.style.display = autoUpdateToggle.checked ? 'block' : 'none';
  
  // Активируем/деактивируем радиокнопки режима
  const radioButtons = document.querySelectorAll('input[name="update-mode"]');
  radioButtons.forEach(radio => {
    radio.disabled = !autoUpdateToggle.checked;
    radio.parentElement.querySelector('.radio-label').classList.toggle('disabled-text', !autoUpdateToggle.checked);
  });
}

// Функция для получения текущего режима автообновления
function getAutoUpdateMode() {
  return currentTabMode.checked ? 'current' : 'all';
}

// Загружаем текущие настройки и инициализируем кнопки по URL активной вкладки
chrome.storage.sync.get('settings', (data) => {
  if (data.settings) {
    faviconToggle.checked = data.settings.faviconEnabled !== undefined ? 
                            data.settings.faviconEnabled : true;
    
    urlParamToggle.checked = data.settings.urlParamEnabled !== undefined ? 
                             data.settings.urlParamEnabled : true;

    // Определяем активный дизайн из URL текущей вкладки, если параметр присутствует
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      let isNewFromUrl = null;
      try {
        const currentUrl = tabs && tabs[0] ? tabs[0].url : null;
        if (currentUrl) {
          const u = new URL(currentUrl);
          if (u.searchParams.has('react_toggle')) {
            isNewFromUrl = u.searchParams.get('react_toggle') === '1';
          }
        }
      } catch (_) {}

      const isNewDesign = (isNewFromUrl !== null)
        ? isNewFromUrl
        : (data.settings.reactToggleValue !== undefined ? data.settings.reactToggleValue : false);

      setDesignButtons(isNewDesign);
    });
    
    // Настройки автообновления
    autoUpdateToggle.checked = data.settings.autoUpdateEnabled !== undefined ?
                             data.settings.autoUpdateEnabled : false;
    
    // Режим автообновления
    if (data.settings.autoUpdateMode === 'all') {
      allTabsMode.checked = true;
    } else {
      currentTabMode.checked = true;
    }
    
    // Устанавливаем выбранные домены в чекбоксах
    if (data.settings.activeDomains && Array.isArray(data.settings.activeDomains)) {
      domainCheckboxes.forEach(checkbox => {
        checkbox.checked = data.settings.activeDomains.includes(checkbox.value);
      });
    }
    
    updateSettingsVisibility();
  }
});

// Обрабатываем переключение настроек
faviconToggle.addEventListener('change', () => {
  chrome.storage.sync.get('settings', (data) => {
    const settings = data.settings || {};
    settings.faviconEnabled = faviconToggle.checked;
    chrome.storage.sync.set({ settings });
  });
});

urlParamToggle.addEventListener('change', () => {
  chrome.storage.sync.get('settings', (data) => {
    const settings = data.settings || {};
    settings.urlParamEnabled = urlParamToggle.checked;
    chrome.storage.sync.set({ settings });
    updateSettingsVisibility();
  });
});

// Обработчики кнопок выбора дизайна
oldDesignButton.addEventListener('click', () => {
  if (oldDesignButton.classList.contains('active')) return;
  setDesignButtons(false);
  chrome.runtime.sendMessage({ action: 'setDesignAndReloadCurrent', value: 0 });
});

newDesignButton.addEventListener('click', () => {
  if (newDesignButton.classList.contains('active')) return;
  setDesignButtons(true);
  chrome.runtime.sendMessage({ action: 'setDesignAndReloadCurrent', value: 1 });
});

// Обработчик для чекбоксов доменов
domainCheckboxes.forEach(checkbox => {
  checkbox.addEventListener('change', () => {
    chrome.storage.sync.get('settings', (data) => {
      const settings = data.settings || {};
      settings.activeDomains = getSelectedDomains();
      chrome.storage.sync.set({ settings });
    });
  });
});

// Обработчик для переключателя автообновления
autoUpdateToggle.addEventListener('change', () => {
  chrome.storage.sync.get('settings', (data) => {
    const settings = data.settings || {};
    settings.autoUpdateEnabled = autoUpdateToggle.checked;
    chrome.storage.sync.set({ settings });
    updateSettingsVisibility();
  });
});

// Обработчики для режима автообновления
currentTabMode.addEventListener('change', () => {
  if (currentTabMode.checked) {
    chrome.storage.sync.get('settings', (data) => {
      const settings = data.settings || {};
      settings.autoUpdateMode = 'current';
      chrome.storage.sync.set({ settings });
    });
  }
});

allTabsMode.addEventListener('change', () => {
  if (allTabsMode.checked) {
    chrome.storage.sync.get('settings', (data) => {
      const settings = data.settings || {};
      settings.autoUpdateMode = 'all';
      chrome.storage.sync.set({ settings });
    });
  }
});

// Обработчик для кнопки "Обновить текущую вкладку"
updateCurrentTabBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'updateCurrentTab' });
  window.close();
});

// Обработчик для кнопки "Обновить все вкладки"
updateAllTabsBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'updateAllTabs' });
  window.close();
});

// Инициализация
updateSettingsVisibility(); 