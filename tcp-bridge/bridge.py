import asyncio
import json
import logging
import os

import serial_asyncio
import websockets
from dotenv import load_dotenv

load_dotenv()

SERIAL_PORT          = os.getenv("SERIAL_PORT", "/dev/ttyUSB0")
SERIAL_BAUD          = int(os.getenv("SERIAL_BAUD", "115200"))
WS_RECONNECT_DELAY   = float(os.getenv("WS_RECONNECT_DELAY", "3.0"))
SERIAL_RECONNECT_DELAY = float(os.getenv("SERIAL_RECONNECT_DELAY", "3.0"))
LOG_LEVEL            = os.getenv("LOG_LEVEL", "INFO")

_raw_url = os.getenv("WS_URL", "ws://localhost:8080")
_SCHEME_MAP = {"http://": "ws://", "https://": "wss://"}
WS_URL = _raw_url
for _http, _ws in _SCHEME_MAP.items():
    if _raw_url.startswith(_http):
        WS_URL = _ws + _raw_url[len(_http):]
        break
if not WS_URL.startswith(("ws://", "wss://")):
    raise ValueError(f"WS_URL must start with ws:// or wss://, got: {_raw_url!r}")

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

# Arduino pushes here; WebSocket sender pulls from here.
message_queue: asyncio.Queue = asyncio.Queue()


def parse_message(raw: str) -> dict | None:
    """Convert a raw serial line from Arduino to a WebSocket event dict.

    Accepted formats (newline-terminated):
      - Plain integer:     "1"                       → {"type":"event","event":1}
      - JSON passthrough:  '{"type":"event","event":1}' → forwarded as-is
    """
    raw = raw.strip()
    if not raw:
        return None

    try:
        msg = json.loads(raw)
        if isinstance(msg, dict) and "type" in msg:
            return msg
    except json.JSONDecodeError:
        pass

    try:
        return {"type": "event", "event": int(raw), "data": {}}
    except ValueError:
        pass

    log.warning("Unrecognized message, dropping: %r", raw)
    return None


async def serial_reader() -> None:
    """Read lines from the Arduino over USB serial and push them to the queue."""
    while True:
        try:
            log.info("Opening %s at %d baud…", SERIAL_PORT, SERIAL_BAUD)
            reader, _ = await serial_asyncio.open_serial_connection(
                url=SERIAL_PORT, baudrate=SERIAL_BAUD
            )
            log.info("Serial port open")
            while True:
                line = await reader.readline()
                if not line:
                    break
                msg = parse_message(line.decode(errors="replace"))
                if msg:
                    log.info("Serial → queue: %s", msg)
                    await message_queue.put(json.dumps(msg))
        except Exception as exc:
            log.error("Serial error: %s — retrying in %.1fs", exc, SERIAL_RECONNECT_DELAY)
            await asyncio.sleep(SERIAL_RECONNECT_DELAY)


async def ws_sender() -> None:
    """Maintain a persistent WebSocket connection, drain the queue, reconnect on failure."""
    while True:
        try:
            async with websockets.connect(WS_URL) as ws:
                log.info("WebSocket connected to %s", WS_URL)
                try:
                    await asyncio.wait_for(ws.recv(), timeout=2.0)
                except (asyncio.TimeoutError, websockets.ConnectionClosed):
                    pass

                while True:
                    payload = await message_queue.get()
                    try:
                        await ws.send(payload)
                        log.info("WebSocket sent: %s", payload)
                    except websockets.ConnectionClosed:
                        await message_queue.put(payload)
                        log.warning("WebSocket closed, reconnecting…")
                        break
        except (OSError, websockets.WebSocketException) as exc:
            log.error("WebSocket error: %s — retrying in %.1fs", exc, WS_RECONNECT_DELAY)
            await asyncio.sleep(WS_RECONNECT_DELAY)


async def main() -> None:
    if WS_URL != _raw_url:
        log.warning("WS_URL rewritten: %r → %r", _raw_url, WS_URL)
    log.info("Serial bridge: %s @ %d baud → WS %s", SERIAL_PORT, SERIAL_BAUD, WS_URL)
    await asyncio.gather(serial_reader(), ws_sender())


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Bridge stopped")
