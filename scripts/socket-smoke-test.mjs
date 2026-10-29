import { io } from 'socket.io-client';

process.env.PORT = '0';
globalThis.fetch = async (input) => {
  const pair = new URL(String(input)).searchParams.get('langpair');
  const translatedText = pair === 'ta|en'
    ? 'Hello, how are you?'
    : 'வணக்கம், நீங்கள் எப்படி இருக்கிறீர்கள்?';
  return Response.json({ responseStatus: 200, responseData: { translatedText } });
};

const { server } = await import('../server/dist/index.js');
if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
const address = server.address();
const endpoint = `http://127.0.0.1:${address.port}`;
const tamilClient = io(endpoint, { autoConnect: false, transports: ['websocket'] });
const englishClient = io(endpoint, { autoConnect: false, transports: ['websocket'] });

const connect = socket => new Promise((resolve, reject) => {
  socket.once('connect', resolve);
  socket.once('connect_error', reject);
  socket.connect();
});
const join = (socket, name, language, roomCode) => new Promise((resolve, reject) => {
  const participant = { id: '', name, language, mode: 'type' };
  socket.emit(roomCode ? 'room:join' : 'room:create', roomCode ? { code: roomCode, participant } : participant,
    result => result?.error ? reject(new Error(result.error)) : resolve(result));
});
const send = (socket, text, sourceLanguage) => new Promise((resolve, reject) => {
  socket.emit('message:send', { text, sourceLanguage },
    result => result?.error ? reject(new Error(result.error)) : resolve(result));
});
const receive = socket => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Message timeout')), 5000);
  socket.once('message:new', message => { clearTimeout(timer); resolve(message); });
});

try {
  await Promise.all([connect(tamilClient), connect(englishClient)]);
  const room = await join(tamilClient, 'Tamil friend', 'Tamil');
  await join(englishClient, 'English friend', 'English', room.roomCode);
  const englishMessage = receive(englishClient);
  await send(tamilClient, 'வணக்கம், நீங்கள் எப்படி இருக்கிறீர்கள்?', 'Tamil');
  const translatedEnglish = await englishMessage;
  const tamilMessage = receive(tamilClient);
  await send(englishClient, 'Hello, how are you today?', 'English');
  const translatedTamil = await tamilMessage;
  const en = translatedEnglish.translations.English;
  const ta = translatedTamil.translations.Tamil;
  if (!en || en === translatedEnglish.original || !ta || ta === translatedTamil.original) {
    throw new Error(`Translation delivery failed: English=${en}; Tamil=${ta}`);
  }
  console.log(JSON.stringify({
    roomCode: room.roomCode,
    Tamil_to_English: { original: translatedEnglish.original, translated: en },
    English_to_Tamil: { original: translatedTamil.original, translated: ta },
    translationProvider: 'deterministic test double for MyMemory'
  }, null, 2));
} finally {
  tamilClient.disconnect();
  englishClient.disconnect();
  server.close();
}
