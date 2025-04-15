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

// Загружаем текущие настройки
chrome.storage.sync.get('settings', (data) => {
  if (data.settings) {
    faviconToggle.checked = data.settings.faviconEnabled !== undefined ? 
                            data.settings.faviconEnabled : true;
    
    urlParamToggle.checked = data.settings.urlParamEnabled !== undefined ? 
                             data.settings.urlParamEnabled : true;
    
    // Настройка кнопок выбора дизайна
    const isNewDesign = data.settings.reactToggleValue !== undefined ?
                             data.settings.reactToggleValue : false;
    
    if (isNewDesign) {
      newDesignButton.classList.add('active');
      oldDesignButton.classList.remove('active');
      reactToggleValue.value = "1";
    } else {
      oldDesignButton.classList.add('active');
      newDesignButton.classList.remove('active');
      reactToggleValue.value = "0";
    }
    
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
  if (!oldDesignButton.classList.contains('active')) {
    oldDesignButton.classList.add('active');
    newDesignButton.classList.remove('active');
    reactToggleValue.value = "0";
    
    chrome.storage.sync.get('settings', (data) => {
      const settings = data.settings || {};
      settings.reactToggleValue = false;
      chrome.storage.sync.set({ settings });
      
      // Если автообновление включено, обновляем страницы
      if (settings.autoUpdateEnabled) {
        if (settings.autoUpdateMode === 'current') {
          chrome.runtime.sendMessage({ action: 'updateCurrentTab' });
        } else {
          chrome.runtime.sendMessage({ action: 'updateAllTabs' });
        }
      }
    });
  }
});

newDesignButton.addEventListener('click', () => {
  if (!newDesignButton.classList.contains('active')) {
    newDesignButton.classList.add('active');
    oldDesignButton.classList.remove('active');
    reactToggleValue.value = "1";
    
    chrome.storage.sync.get('settings', (data) => {
      const settings = data.settings || {};
      settings.reactToggleValue = true;
      chrome.storage.sync.set({ settings });
      
      // Если автообновление включено, обновляем страницы
      if (settings.autoUpdateEnabled) {
        if (settings.autoUpdateMode === 'current') {
          chrome.runtime.sendMessage({ action: 'updateCurrentTab' });
        } else {
          chrome.runtime.sendMessage({ action: 'updateAllTabs' });
        }
      }
    });
  }
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
  // Отправляем сообщение в background script для обновления активной вкладки
  chrome.runtime.sendMessage({ action: 'updateCurrentTab' });
  
  // Закрываем popup после клика
  window.close();
});

// Обработчик для кнопки "Обновить все вкладки"
updateAllTabsBtn.addEventListener('click', () => {
  // Отправляем сообщение в background script для обновления всех вкладок
  chrome.runtime.sendMessage({ action: 'updateAllTabs' });
  
  // Закрываем popup после клика
  window.close();
});

// Инициализация
updateSettingsVisibility(); 