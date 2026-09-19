"""WebSocket router handling client connection lifecycle and subscription commands."""

import asyncio
import inspect
import json
from typing import Any

from src.broadcaster.connection_manager import ConnectionManager
from src.broadcaster.feed_broadcaster import FeedBroadcaster

try:
    from starlette.websockets import WebSocketDisconnect
except ImportError:
    class WebSocketDisconnect(Exception):  # type: ignore
        """Fallback WebSocketDisconnect exception when starlette is not present."""
        pass


class WebSocketRouter:
    """Handles WebSocket client connection lifecycles and inbound command routing."""

    def __init__(
        self,
        connection_manager: ConnectionManager,
        feed_broadcaster: FeedBroadcaster,
    ) -> None:
        self.connection_manager = connection_manager
        self.feed_broadcaster = feed_broadcaster

    async def handle_connection(self, websocket: Any) -> None:
        """Accept connection, register client, and process inbound commands."""
        accept_result = websocket.accept()
        if inspect.isawaitable(accept_result):
            await accept_result
        self.connection_manager.register(websocket)

        try:
            while True:
                try:
                    raw_message = await websocket.receive_text()
                except (ConnectionResetError, BrokenPipeError, WebSocketDisconnect):
                    self.connection_manager.remove_connection(websocket)
                    try:
                        close_result = websocket.close()
                        if inspect.isawaitable(close_result):
                            await close_result
                    except Exception:
                        pass
                    break

                try:
                    data = json.loads(raw_message)
                    if not isinstance(data, dict):
                        raise ValueError("Message must be a JSON object.")
                except (json.JSONDecodeError, ValueError):
                    await self._send_error(websocket, "Invalid JSON payload.")
                    continue

                action = data.get("action")
                topic = data.get("topic")

                if action == "subscribe":
                    if not topic:
                        await self._send_error(websocket, "Missing topic for subscribe.")
                    else:
                        self.connection_manager.subscribe(websocket, topic)
                elif action == "unsubscribe":
                    if not topic:
                        await self._send_error(websocket, "Missing topic for unsubscribe.")
                    else:
                        self.connection_manager.unsubscribe(websocket, topic)
                else:
                    await self._send_error(websocket, f"Unsupported action: {action}")
        except asyncio.CancelledError:
            raise

    async def _send_error(self, websocket: Any, error_message: str) -> None:
        """Send a formatted error frame to the client."""
        payload = json.dumps({"status": "error", "error": error_message})
        try:
            send_result = websocket.send_text(payload)
            if inspect.isawaitable(send_result):
                await send_result
        except (ConnectionResetError, BrokenPipeError, WebSocketDisconnect):
            self.connection_manager.remove_connection(websocket)