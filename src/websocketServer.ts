import WebSocket from 'ws';
import { Logger } from 'homebridge';
import { yamnet_class_map } from './yamnet_class_map';

const parser = yamnet_class_map;

const classMap: { [key: number]: string } = {};

for (const item of parser) {
  classMap[item.index] = item.display_name;
}

export interface WSClientInfo {
  name: string;
  uuid: string;
}

export class WebSocketServer {
  private wss: WebSocket.Server;
  public readonly clients: Map<WebSocket, WSClientInfo> = new Map();

  addClient(client: WebSocket, info: WSClientInfo) {
    this.clients.set(client, info);
    this.callbackDeviceOnline(info);
  }

  getClient(client: WebSocket) {
    return this.clients.get(client);
  }

  removeClient(client: WebSocket) {
    this.clients.delete(client);
  }

  constructor(
    public readonly log: Logger,
    private port: number,
    private readonly callbackDeviceOnline: (info: WSClientInfo) => void,
    private readonly callbackDevicePushProbability:
      (info: WSClientInfo, result: { index: number; display_name: string; probability: number }[]) => void,
  ) {

    this.wss = new WebSocket.Server({ port: this.port });

    this.wss.on('connection', ws => {
      ws.on('message', (message: { buffer: string | unknown[]; byteOffset: number; byteLength: number } | string ) => {
        if (message instanceof Buffer) {
          try {
            const arrayBuffer = message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength) as unknown as ArrayBuffer;
            this.handleRawBuffer(ws, arrayBuffer);
          } catch (e) {
            log.error('Failed to decode', e);
          }
        }
      });
      ws.on('close', () => {
        const info = this.getClient(ws);
        if (info) {
          this.removeClient(ws);
          this.log.info('Client disconnected:', info.name, info.uuid);
        }
      });
      ws.on('error', error => {
        log.error('WebSocket client error', error);
      });
    });

    this.wss.on('error', error => {
      log.error('WebSocket server error', error);
    });

    this.wss.on('close', () => {
      log.info('WebSocket server closed');
    });

    log.info('WebSocket server started on port', this.port);

  }

  /**
   * 处理Buffer数据
   * @param client WebSocket客户端
   * @param data 原始Buffer数据
   */
  handleRawBuffer(client: WebSocket, data: ArrayBuffer) {
    // 读取第一个字节
    const view = new DataView(data);
    const packId = view.getUint8(0);
    switch (packId) {
      case 0x00: {
        // hello
        const buffer = data.slice(1);
        // 解析为字符串
        this.handelHelloData(client, buffer);
        break;
      }
      case 0x01: {
        // probability
        const buffer = data.slice(1);
        this.handleProbabilityData(client, buffer);
        break;
      }
      default: {
        this.log.error('Unknown pack id:', packId);
        break;
      }
    }
  }

  /**
   * 解码Hello数据
   * @param client WebSocket客户端
   * @param data
   */
  handelHelloData(client: WebSocket, data: ArrayBuffer) {
    const buffer = Buffer.from(data);
    const json = JSON.parse(buffer.toString()) as WSClientInfo;
    json.uuid = json.uuid.toLowerCase();
    this.log.info('Hello from', json.name, json.uuid);
    this.addClient(client, json);
  }

  /**
   * 处理可能性数据
   * @param client WebSocket客户端
   * @param data 原始可能性数据的Buffer
   * @returns 解码出的结果
   */
  handleProbabilityData(client: WebSocket, data: ArrayBuffer) {
    const userInfo = this.getClient(client);
    if (!userInfo) {
      this.log.debug('Unknown client from ', client);
      return;
    }
    const result = this.decodeProbabilityData(data);
    const displayResult = result.map(item => ({
      ...item,
      display_name: classMap[item.index],
    }));
    // 根据probability数值从大到小排序
    displayResult.sort((a, b) => b.probability - a.probability);
    this.callbackDevicePushProbability(userInfo, displayResult);
    // this.log.debug(JSON.stringify(result));
  }

  /**
   * 解码可能性数据
   * @param data 原始可能性数据的Buffer
   */
  decodeProbabilityData(data: ArrayBuffer): { index: number; probability: number }[] {
    const view = new DataView(data);
    const result: { index: number; probability: number }[] = [];

    for (let i = 0; i < view.byteLength; i += 6) {
      // 读取索引（2 字节）
      const index = view.getUint16(i, true);
      // 读取可能性（4 字节）
      const probability = view.getFloat32(i + 2, true);
      result.push({ index, probability });
    }

    return result;
  }

  close() {
    this.wss.close();
  }

}