"""Connection manager responsible for tracking active WebSocket connections and subscriptions."""

from typing import Any, Dict, Set


class ConnectionManager:
    """Manages active client connections and their channel/topic subscriptions."""

    def __init__(self) -> None:
        self._connections: Set[Any] = set()
        self._topic_subscribers: Dict[str, Set[Any]] = {}
        self._client_topics: Dict[Any, Set[str]] = {}

    @property
    def active_connections_count(self) -> int:
        """Return the number of currently active connections."""
        return len(self._connections)

    def is_connected(self, websocket: Any) -> bool:
        """Check if a websocket connection is registered and active."""
        return websocket in self._connections

    def register(self, websocket: Any) -> None:
        """Register a new active websocket connection."""
        self._connections.add(websocket)
        if websocket not in self._client_topics:
            self._client_topics[websocket] = set()

    def unregister(self, websocket: Any) -> None:
        """Unregister an active websocket connection and clear its subscriptions."""
        self.remove_connection(websocket)

    def subscribe(self, websocket: Any, topic: str) -> None:
        """Subscribe a registered websocket to a specific topic channel."""
        if websocket not in self._connections:
            raise KeyError(f"Client {websocket} is not registered.")
        if topic not in self._topic_subscribers:
            self._topic_subscribers[topic] = set()
        self._topic_subscribers[topic].add(websocket)
        self._client_topics[websocket].add(topic)

    def unsubscribe(self, websocket: Any, topic: str) -> None:
        """Unsubscribe a websocket from a specific topic channel."""
        if topic in self._topic_subscribers:
            self._topic_subscribers[topic].discard(websocket)
            if not self._topic_subscribers[topic]:
                del self._topic_subscribers[topic]
        if websocket in self._client_topics:
            self._client_topics[websocket].discard(topic)

    def get_subscribers(self, topic: str) -> Set[Any]:
        """Return a set of active subscribers for a given topic."""
        subscribers = self._topic_subscribers.get(topic)
        if not subscribers:
            return set()
        return set(subscribers)

    def remove_connection(self, websocket: Any) -> None:
        """Safely remove a connection and evict it from all subscribed channels."""
        self._connections.discard(websocket)
        topics = self._client_topics.pop(websocket, set())
        for topic in topics:
            if topic in self._topic_subscribers:
                self._topic_subscribers[topic].discard(websocket)
                if not self._topic_subscribers[topic]:
                    del self._topic_subscribers[topic]