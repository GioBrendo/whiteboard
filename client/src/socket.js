import { io } from 'socket.io-client';

// Determine backend URL automatically
// If accessed via localhost, IP, or custom domain
const getBackendUrl = () => {
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  
  const { protocol, hostname, port } = window.location;
  // If running on Vite dev server (usually port 5173), server runs on 3001
  if (port === '5173') {
    return `${protocol}//${hostname}:3001`;
  }
  // Otherwise use same origin
  return window.location.origin;
};

export const socket = io(getBackendUrl(), {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000
});
