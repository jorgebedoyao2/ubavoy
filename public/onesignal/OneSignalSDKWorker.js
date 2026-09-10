// Service worker de OneSignal.
// Vive en su propio espacio (/onesignal/) para no pisarse con los service
// workers de las apps, que son los que hacen que la PWA se instale y
// funcione sin señal. Si compartieran espacio, uno desplazaria al otro.
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDKWorker.js');
