// walletConnector.js

// Глобальная переменная для Unity instance
var unityInstance;

// Функция для инициализации Unity instance
function initializeUnityInstance(instance) {
    unityInstance = instance;
}

// Функция подключения кошелька (вызывается из Unity)
function ConnectWallet(manifestUrl) {
    console.log("Подключение к кошельку с манифестом по URL:", manifestUrl);
    
    // Здесь можно добавить логику подключения кошелька через TON Connect
    setTimeout(() => {
        // Пример: передача адреса кошелька в Unity
        unityInstance.SendMessage('WalletConnection', 'OnWalletConnected', '0:123456789abcdef');
    }, 2000);
}

// Функция отключения кошелька (вызывается из Unity)
function DisconnectWallet() {
    console.log("Отключение кошелька");
    
    // Здесь можно добавить логику отключения кошелька
    setTimeout(() => {
        unityInstance.SendMessage('WalletConnection', 'OnWalletDisconnected');
    }, 2000);
}

// Функция для симуляции ошибки
function SimulateError(message) {
    if (unityInstance) {
        unityInstance.SendMessage('WalletConnection', 'OnWalletError', message);
    }
}
