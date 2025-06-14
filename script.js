// Константы
const SUPABASE_URL = 'https://sqoysssbifbjjqudpdpd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNxb3lzc3NiaWZiampxdWRwZHBkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5MjIyMTEsImV4cCI6MjA2NTQ5ODIxMX0.KKfHgo8IBDSUhAMbrQK7ZlHcWgei5QHb0E0Lyft2xG0';
const USER1_CODE = '394x1lclSlc';
const USER2_CODE = 'xkb984kxaw@';
const ACCESS_CODE_KEY = 'messenger_access_code';
const MESSAGES_PER_PAGE = 50;
const NOTIFICATIONS_ENABLED_KEY = 'notifications_enabled';

// Инициализация Supabase клиента
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Элементы DOM
const loginForm = document.getElementById('login-form');
const chatContainer = document.getElementById('chat-container');
const accessCodeInput = document.getElementById('access-code');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const currentUserElement = document.getElementById('current-user');
const otherUserStatusElement = document.getElementById('other-user-status');
const logoutBtn = document.getElementById('logout-btn');

// Глобальные переменные
let currentUser = null;
let otherUser = null;
let subscription = null;
let statusSubscription = null;
let isOnline = false;
let currentPage = 0;
let hasMoreMessages = true;
let isLoadingMessages = false;
let oldestMessageTimestamp = null;
let notificationsEnabled = false;
let isPageVisible = true;

// Проверяем, есть ли сохраненный код доступа
document.addEventListener('DOMContentLoaded', () => {
    const savedAccessCode = localStorage.getItem(ACCESS_CODE_KEY);
    
    if (savedAccessCode) {
        accessCodeInput.value = savedAccessCode;
        // Автоматический вход с небольшой задержкой
        setTimeout(() => {
            loginBtn.click();
        }, 500);
    }
    
    // Разрешаем вставку из буфера обмена
    accessCodeInput.addEventListener('paste', (e) => {
        e.stopPropagation();
    });

    // Исправление для мобильных устройств - фокус на поле ввода
    messageInput.addEventListener('focus', () => {
        // Прокручиваем к последнему сообщению с задержкой, чтобы учесть появление клавиатуры
        setTimeout(() => {
            scrollToBottom();
        }, 300);
    });

    // Обработчик для восстановления соединения при возвращении на страницу
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Обработчик для восстановления соединения при восстановлении интернета
    window.addEventListener('online', handleOnlineStatus);
    window.addEventListener('offline', handleOfflineStatus);
    
    // Проверяем, включены ли уведомления
    notificationsEnabled = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) === 'true';
    
    // Проверяем видимость страницы
    isPageVisible = document.visibilityState === 'visible';
});

// Обработчик видимости страницы
async function handleVisibilityChange() {
    isPageVisible = document.visibilityState === 'visible';
    
    if (isPageVisible && currentUser) {
        if (!isOnline) {
            await reconnect();
        }
    } else if (!isPageVisible && currentUser) {
        // Обновляем статус при скрытии страницы
        await updateUserStatus(currentUser, false);
        isOnline = false;
    }
}

// Обработчик статуса соединения
async function handleOnlineStatus() {
    if (currentUser) {
        await reconnect();
    }
}

async function handleOfflineStatus() {
    if (currentUser) {
        isOnline = false;
        // Можно добавить уведомление о потере соединения
    }
}

// Функция для переподключения
async function reconnect() {
    try {
        // Обновляем статус пользователя (онлайн)
        await updateUserStatus(currentUser, true);
        isOnline = true;
        
        // Переподключаем подписки, если они были
        if (!subscription) {
            subscribeToMessages();
        }
        
        // Обновляем список сообщений
        await loadInitialMessages();
        
        // Проверяем статус другого пользователя
        await checkOtherUserStatus();
    } catch (error) {
        console.error('Ошибка переподключения:', error);
    }
}

// Функция для запроса разрешения на уведомления
async function requestNotificationPermission() {
    try {
        if (!('Notification' in window)) {
            console.log('Этот браузер не поддерживает уведомления');
            return false;
        }
        
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            notificationsEnabled = true;
            localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'true');
            
            // Показываем тестовое уведомление
            showNotification('Уведомления включены', 'Теперь вы будете получать уведомления о новых сообщениях');
            
            return true;
        } else {
            notificationsEnabled = false;
            localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'false');
            return false;
        }
    } catch (error) {
        console.error('Ошибка при запросе разрешения на уведомления:', error);
        return false;
    }
}

// Функция для отображения уведомления
function showNotification(title, body, icon = '') {
    if (!notificationsEnabled || isPageVisible) return;
    
    try {
        if (Notification.permission === 'granted') {
            const notification = new Notification(title, {
                body: body,
                icon: icon || '/favicon.ico',
                badge: icon || '/favicon.ico',
                tag: 'message-notification',
                silent: false
            });
            
            notification.onclick = function() {
                window.focus();
                this.close();
            };
            
            // Автоматически закрываем уведомление через 5 секунд
            setTimeout(() => {
                notification.close();
            }, 5000);
        }
    } catch (error) {
        console.error('Ошибка при отображении уведомления:', error);
    }
}

// Функция для создания и добавления кнопки включения уведомлений
function createNotificationToggle() {
    // Проверяем, есть ли уже кнопка
    if (document.getElementById('notification-toggle')) return;
    
    const notificationToggle = document.createElement('button');
    notificationToggle.id = 'notification-toggle';
    notificationToggle.className = 'notification-toggle';
    notificationToggle.textContent = notificationsEnabled ? 'Отключить уведомления' : 'Включить уведомления';
    
    notificationToggle.addEventListener('click', async () => {
        if (notificationsEnabled) {
            // Отключаем уведомления
            notificationsEnabled = false;
            localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, 'false');
            notificationToggle.textContent = 'Включить уведомления';
        } else {
            // Включаем уведомления
            const granted = await requestNotificationPermission();
            notificationToggle.textContent = granted ? 'Отключить уведомления' : 'Включить уведомления';
        }
    });
    
    // Добавляем кнопку в заголовок чата
    const chatHeader = document.querySelector('.chat-header');
    if (chatHeader) {
        chatHeader.appendChild(notificationToggle);
    }
}

// Функция для входа в систему
loginBtn.addEventListener('click', async () => {
    const accessCode = accessCodeInput.value.trim();
    
    if (!accessCode) {
        showError('Пожалуйста, введите код доступа');
        return;
    }
    
    if (accessCode === USER1_CODE) {
        currentUser = 'user1';
        otherUser = 'user2';
    } else if (accessCode === USER2_CODE) {
        currentUser = 'user2';
        otherUser = 'user1';
    } else {
        showError('Неверный код доступа');
        return;
    }
    
    try {
        // Сохраняем код доступа в localStorage
        localStorage.setItem(ACCESS_CODE_KEY, accessCode);
        
        // Обновляем статус пользователя (онлайн)
        await updateUserStatus(currentUser, true);
        isOnline = true;
        
        // Загружаем сообщения
        await loadInitialMessages();
        
        // Подписываемся на новые сообщения
        subscribeToMessages();
        
        // Проверяем статус другого пользователя
        checkOtherUserStatus();
        
        // Показываем чат
        loginForm.classList.add('hidden');
        chatContainer.classList.remove('hidden');
        
        // Отображаем имя текущего пользователя
        currentUserElement.textContent = `Вы: ${currentUser === 'user1' ? 'Пользователь 1' : 'Пользователь 2'}`;
        
        // Устанавливаем обработчик для отправки сообщений
        sendBtn.addEventListener('click', sendMessage);
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // Обработчик для обновления статуса при закрытии страницы
        window.addEventListener('beforeunload', async () => {
            await updateUserStatus(currentUser, false);
        });
        
        // Добавляем обработчик скролла для загрузки предыдущих сообщений
        messagesContainer.addEventListener('scroll', handleMessagesScroll);
        
        // Создаем кнопку включения уведомлений
        createNotificationToggle();
        
        // Если уведомления еще не включены, предлагаем включить их
        if (!notificationsEnabled && Notification.permission !== 'denied') {
            setTimeout(() => {
                if (confirm('Хотите получать уведомления о новых сообщениях?')) {
                    requestNotificationPermission();
                }
            }, 2000);
        }
        
        // Фокус на поле ввода
        messageInput.focus();
        
        // Прокручиваем к последнему сообщению
        scrollToBottom();
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        showError('Произошла ошибка при входе в систему');
    }
});

// Функция для выхода из системы
logoutBtn.addEventListener('click', async () => {
    try {
        // Обновляем статус пользователя (офлайн)
        await updateUserStatus(currentUser, false);
        isOnline = false;
        
        // Отписываемся от сообщений
        if (subscription) {
            subscription.unsubscribe();
            subscription = null;
        }
        
        // Отписываемся от статуса
        if (statusSubscription) {
            statusSubscription.unsubscribe();
            statusSubscription = null;
        }
        
        // Очищаем данные пользователя
        currentUser = null;
        otherUser = null;
        
        // Сбрасываем состояние пагинации
        currentPage = 0;
        hasMoreMessages = true;
        oldestMessageTimestamp = null;
        
        // Удаляем код доступа из localStorage, если пользователь хочет полностью выйти
        // Если нужно сохранить код, эту строку можно закомментировать
        // localStorage.removeItem(ACCESS_CODE_KEY);
        
        // Показываем форму входа
        chatContainer.classList.add('hidden');
        loginForm.classList.remove('hidden');
        
        // Очищаем поле ввода сообщения
        messageInput.value = '';
        
    } catch (error) {
        console.error('Ошибка выхода:', error);
        alert('Произошла ошибка при выходе из системы');
    }
});

// Функция для отображения ошибки
function showError(message) {
    loginError.textContent = message;
    setTimeout(() => {
        loginError.textContent = '';
    }, 3000);
}

// Функция для обновления статуса пользователя
async function updateUserStatus(user, isOnline) {
    if (!user) return;
    
    try {
        const timestamp = new Date().toISOString();
        await supabase
            .from('user_status')
            .upsert({ 
                user_id: user, 
                is_online: isOnline, 
                last_seen: timestamp 
            }, { 
                onConflict: 'user_id' 
            });
    } catch (error) {
        console.error('Ошибка обновления статуса:', error);
    }
}

// Функция для проверки статуса другого пользователя
async function checkOtherUserStatus() {
    if (!otherUser) return;
    
    try {
        const { data, error } = await supabase
            .from('user_status')
            .select('*')
            .eq('user_id', otherUser)
            .single();
        
        if (error) throw error;
        
        updateOtherUserStatusUI(data);
        
        // Отписываемся от предыдущей подписки, если она есть
        if (statusSubscription) {
            statusSubscription.unsubscribe();
        }
        
        // Подписка на изменения статуса другого пользователя
        statusSubscription = supabase
            .channel('user_status_changes')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'user_status',
                filter: `user_id=eq.${otherUser}`
            }, (payload) => {
                updateOtherUserStatusUI(payload.new);
                
                // Если пользователь вошел в сеть, показываем уведомление
                if (payload.new.is_online && !payload.old?.is_online) {
                    const otherUserName = otherUser === 'user1' ? 'Пользователь 1' : 'Пользователь 2';
                    showNotification(`${otherUserName} онлайн`, `${otherUserName} вошел в сеть`);
                }
            })
            .subscribe();
            
    } catch (error) {
        console.error('Ошибка проверки статуса:', error);
    }
}

// Функция для обновления UI статуса другого пользователя
function updateOtherUserStatusUI(statusData) {
    if (!statusData || !otherUserStatusElement) return;
    
    const otherUserName = otherUser === 'user1' ? 'Пользователь 1' : 'Пользователь 2';
    
    if (statusData.is_online) {
        otherUserStatusElement.textContent = `${otherUserName} онлайн`;
    } else {
        const lastSeen = new Date(statusData.last_seen);
        const formattedDate = formatDateTime(lastSeen);
        otherUserStatusElement.textContent = `${otherUserName} был в сети ${formattedDate}`;
    }
}

// Функция для загрузки начальных сообщений
async function loadInitialMessages() {
    try {
        // Сбрасываем состояние пагинации
        currentPage = 0;
        hasMoreMessages = true;
        oldestMessageTimestamp = null;
        
        // Очищаем контейнер сообщений
        messagesContainer.innerHTML = '';
        
        // Загружаем первую страницу сообщений
        await loadMoreMessages(true);
        
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
    }
}

// Функция для загрузки дополнительных сообщений
async function loadMoreMessages(isInitial = false) {
    if (isLoadingMessages || !hasMoreMessages) return;
    
    isLoadingMessages = true;
    
    try {
        let query = supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(MESSAGES_PER_PAGE);
        
        // Если это не начальная загрузка и есть временная метка старейшего сообщения
        if (!isInitial && oldestMessageTimestamp) {
            query = query.lt('created_at', oldestMessageTimestamp);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        // Если получено меньше сообщений, чем запрошено, значит больше нет
        if (data.length < MESSAGES_PER_PAGE) {
            hasMoreMessages = false;
        }
        
        // Если есть сообщения
        if (data.length > 0) {
            // Запоминаем временную метку самого старого сообщения
            oldestMessageTimestamp = data[data.length - 1].created_at;
            
            // Сохраняем текущую позицию скролла, если это не начальная загрузка
            const scrollPosition = isInitial ? 0 : messagesContainer.scrollHeight;
            
            // Добавляем сообщения в начало контейнера (они отсортированы в обратном порядке)
            data.reverse().forEach(message => {
                if (isInitial) {
                    // Для начальной загрузки добавляем в конец
                    addMessageToUI(message);
                } else {
                    // Для дополнительной загрузки добавляем в начало
                    prependMessageToUI(message);
                }
            });
            
            // Если это не начальная загрузка, восстанавливаем позицию скролла
            if (!isInitial && messagesContainer.scrollHeight > scrollPosition) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight - scrollPosition;
            }
            
            // Если это начальная загрузка, прокручиваем к последнему сообщению
            if (isInitial) {
                scrollToBottom();
            }
            
            // Если есть еще сообщения и это не начальная загрузка, показываем кнопку "Загрузить еще"
            if (hasMoreMessages && !isInitial) {
                showLoadMoreButton();
            }
        } else {
            hasMoreMessages = false;
            
            if (!isInitial) {
                showNoMoreMessagesIndicator();
            }
        }
        
        currentPage++;
        
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
    } finally {
        isLoadingMessages = false;
    }
}

// Функция для отображения кнопки "Загрузить еще"
function showLoadMoreButton() {
    // Проверяем, есть ли уже кнопка
    if (document.getElementById('load-more-btn')) return;
    
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.id = 'load-more-btn';
    loadMoreBtn.className = 'load-more-btn';
    loadMoreBtn.textContent = 'Загрузить еще сообщения';
    loadMoreBtn.addEventListener('click', async () => {
        loadMoreBtn.remove();
        await loadMoreMessages();
    });
    
    // Добавляем в начало контейнера
    messagesContainer.insertBefore(loadMoreBtn, messagesContainer.firstChild);
}

// Функция для отображения индикатора "Больше нет сообщений"
function showNoMoreMessagesIndicator() {
    // Проверяем, есть ли уже индикатор
    if (document.getElementById('no-more-messages')) return;
    
    const noMoreMessages = document.createElement('div');
    noMoreMessages.id = 'no-more-messages';
    noMoreMessages.className = 'no-more-messages';
    noMoreMessages.textContent = 'Начало истории сообщений';
    
    // Добавляем в начало контейнера
    messagesContainer.insertBefore(noMoreMessages, messagesContainer.firstChild);
}

// Обработчик скролла для загрузки предыдущих сообщений
function handleMessagesScroll() {
    // Если скролл близко к верху и есть еще сообщения, показываем кнопку "Загрузить еще"
    if (messagesContainer.scrollTop < 100 && hasMoreMessages && !isLoadingMessages && !document.getElementById('load-more-btn')) {
        showLoadMoreButton();
    }
}

// Функция для подписки на новые сообщения
function subscribeToMessages() {
    // Отписываемся от предыдущей подписки, если она есть
    if (subscription) {
        subscription.unsubscribe();
    }
    
    subscription = supabase
        .channel('messages_channel')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages' 
        }, (payload) => {
            const message = payload.new;
            addMessageToUI(message);
            scrollToBottom();
            
            // Если сообщение от другого пользователя и страница не активна, показываем уведомление
            if (message.sender === otherUser && !isPageVisible) {
                const senderName = message.sender === 'user1' ? 'Пользователь 1' : 'Пользователь 2';
                showNotification(`Новое сообщение от ${senderName}`, message.content);
            }
        })
        .subscribe();
}

// Функция для отправки сообщения
async function sendMessage() {
    const messageText = messageInput.value.trim();
    
    if (!messageText) return;
    
    try {
        const timestamp = new Date().toISOString();
        
        const { error } = await supabase
            .from('messages')
            .insert({
                sender: currentUser,
                content: messageText,
                created_at: timestamp
            });
        
        if (error) throw error;
        
        // Очищаем поле ввода
        messageInput.value = '';
        
        // Возвращаем фокус на поле ввода
        messageInput.focus();
        
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        alert('Не удалось отправить сообщение');
    }
}

// Функция для добавления сообщения в UI (в конец)
function addMessageToUI(message) {
    if (!messagesContainer) return;
    
    const messageElement = createMessageElement(message);
    
    // Добавляем сообщение в конец контейнера
    messagesContainer.appendChild(messageElement);
}

// Функция для добавления сообщения в UI (в начало)
function prependMessageToUI(message) {
    if (!messagesContainer) return;
    
    const messageElement = createMessageElement(message);
    
    // Добавляем сообщение в начало контейнера
    const firstChild = messagesContainer.firstChild;
    if (firstChild) {
        messagesContainer.insertBefore(messageElement, firstChild);
    } else {
        messagesContainer.appendChild(messageElement);
    }
}

// Функция для создания элемента сообщения
function createMessageElement(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    
    // Определяем, отправлено ли сообщение текущим пользователем
    const isSentByCurrentUser = message.sender === currentUser;
    messageElement.classList.add(isSentByCurrentUser ? 'sent' : 'received');
    
    // Создаем содержимое сообщения
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    messageContent.textContent = message.content;
    
    // Создаем информацию о сообщении (время и отправитель)
    const messageInfo = document.createElement('div');
    messageInfo.classList.add('message-info');
    
    const messageTime = formatDateTime(new Date(message.created_at));
    const senderName = message.sender === 'user1' ? 'Пользователь 1' : 'Пользователь 2';
    
    messageInfo.textContent = `${senderName}, ${messageTime}`;
    
    // Добавляем элементы в сообщение
    messageElement.appendChild(messageContent);
    messageElement.appendChild(messageInfo);
    
    return messageElement;
}

// Функция для прокрутки к последнему сообщению
function scrollToBottom() {
    if (messagesContainer) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
}

// Функция для форматирования даты и времени
function formatDateTime(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${day}.${month}.${year} ${hours}:${minutes}`;
}

// Запрет прокрутки истории чата колесиком мыши
messagesContainer.addEventListener('wheel', (e) => {
    // Теперь разрешаем прокрутку колесиком, но только для загрузки старых сообщений
    // e.preventDefault();
});

// Разрешаем копирование текста и масштабирование страницы
document.addEventListener('keydown', (e) => {
    // Разрешаем Ctrl+C для копирования
    if (e.ctrlKey && e.key === 'c') {
        return;
    }
    
    // Разрешаем Ctrl+V для вставки
    if (e.ctrlKey && e.key === 'v') {
        return;
    }
    
    // Разрешаем Ctrl++ и Ctrl+- для масштабирования
    if (e.ctrlKey && (e.key === '+' || e.key === '-')) {
        return;
    }
    
    // Блокируем другие сочетания клавиш для навигации по истории
    if (e.ctrlKey || e.altKey || e.key === 'PageUp' || e.key === 'PageDown' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
    }
}); 