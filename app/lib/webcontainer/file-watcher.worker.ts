// app/lib/webcontainer/file-watcher.worker.ts
import type { PathWatcherEvent } from '@webcontainer/api';
import { getEncoding } from 'istextorbinary';
import { Buffer } from 'node:buffer';

let fileMap = {};
let size = 0;
const utf8TextDecoder = new TextDecoder('utf8', { fatal: true });

function bufferWatchEvents<T extends unknown[]>(
  timeInMs: number,
  maxBufferSize: number,
  cb: (events: T[]) => unknown,
) {
  let timeoutId: number | undefined;
  let events: T[] = [];
  let processing: Promise<unknown> = Promise.resolve();

  const flush = async () => {
    await processing;
    if (events.length > 0) {
      processing = Promise.resolve(cb(events));
    }
    timeoutId = undefined;
    events = [];
  };

  const scheduleBufferTick = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = self.setTimeout(flush, timeInMs);
  };

  return (...args: T) => {
    events.push(args);
    if (events.length >= maxBufferSize) {
      if (timeoutId) clearTimeout(timeoutId);
      void flush();
    } else {
      scheduleBufferTick();
    }
  };
}

function processEventBuffer(events: Array<[events: PathWatcherEvent[]]>) {
  const watchEvents = events.flat(2);
  const newFileMap = { ...fileMap };

  for (const { type, path, buffer } of watchEvents) {
    const sanitizedPath = path.replace(/\/+$/g, '');
    switch (type) {
      case 'add_dir':
        newFileMap[sanitizedPath] = { type: 'folder' };
        break;
      case 'remove_dir':
        delete newFileMap[sanitizedPath];
        for (const direntPath in newFileMap) {
          if (direntPath.startsWith(`${sanitizedPath}/`)) {
            delete newFileMap[direntPath];
          }
        }
        break;
      case 'add_file':
      case 'change': {
        if (type === 'add_file') size++;
        let content = '';
        const isBinary = isBinaryFile(buffer);
        if (!isBinary) {
          content = decodeFileContent(buffer);
        }
        newFileMap[sanitizedPath] = { type: 'file', content, isBinary };
        break;
      }
      case 'remove_file':
        size--;
        delete newFileMap[sanitizedPath];
        break;
      case 'update_directory':
        break;
    }
  }
  fileMap = newFileMap;
  postMessage({ type: 'update', fileMap, size });
}

function decodeFileContent(buffer?: Uint8Array) {
  if (!buffer || buffer.byteLength === 0) return '';
  try {
    return utf8TextDecoder.decode(buffer);
  } catch (error) {
    console.log(error);
    return '';
  }
}

function isBinaryFile(buffer: Uint8Array | undefined) {
  if (buffer === undefined) return false;
  return getEncoding(convertToBuffer(buffer), { chunkLength: 100 }) === 'binary';
}

function convertToBuffer(view: Uint8Array): Buffer {
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}

const processEvent = bufferWatchEvents(200, 50, processEventBuffer);

onmessage = (event) => {
  if (event.data.type === 'init') {
    fileMap = event.data.fileMap;
    size = event.data.size;
  } else if (event.data.type === 'event') {
    processEvent(event.data.event);
  }
};
