import { io } from 'socket.io-client';

const socket = io({
  path: '/socket.io',
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 800,
});

socket.on('connect', () => console.log('[ws] connected', socket.id));
socket.on('disconnect', (reason) => console.log('[ws] disconnected', reason));
socket.on('connect_error', (err) => console.warn('[ws] connect_error', err.message));

export default socket;
