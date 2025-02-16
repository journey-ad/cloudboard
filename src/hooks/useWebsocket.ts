import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

/**
 * WebSocket连接Hook
 * @param {object} config - WebSocket配置
 * @param {string} config.url - WebSocket服务器URL
 * @param {boolean} shouldConnect - 是否应该建立连接
 * @returns {object} WebSocket连接状态和实例
 */
const useWebsocketConnection = ({ url }: { url: string }, shouldConnect = true) => {
  const socketRef = useRef<Socket | null>(null);

  const [isConnected, setIsConnected] = useState(false);

  function socketClient() {
    const socket = io(url, {
      transports: ['websocket']
    });

    socket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    socketRef.current = socket;
  }

  useEffect(() => {
    if (!shouldConnect) {
      return;
    }

    socketClient();

    return () => {
      setIsConnected(false);
      socketRef.current?.disconnect();
    };
  }, [shouldConnect, url]);

  return {
    socket: socketRef.current,
    isConnected,
    emit: (event: string, data: any) => {
      socketRef.current?.emit(event, data);
    },
    on: (event: string, callback: (data: any) => void) => {
      socketRef.current?.on(event, callback);
    },
    connect: () => {
      socketRef.current?.connect();
    },
    disconnect: () => {
      socketRef.current?.disconnect();
    }
  };
}

export default useWebsocketConnection;
