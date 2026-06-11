using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;

namespace UnityWebSocketStack
{
    [Serializable]
    internal class WsMessage
    {
        public string type;
        public int @event;
    }

    public class WebSocketClient : MonoBehaviour
    {
        [SerializeField] private string serverUrl = "ws://localhost:8080";

        private ClientWebSocket _ws;
        private CancellationTokenSource _cts;
        private readonly ConcurrentQueue<WsMessage> _queue = new ConcurrentQueue<WsMessage>();
        private readonly Dictionary<int, List<Action<int>>> _listeners = new Dictionary<int, List<Action<int>>>();

        public bool IsConnected => _ws?.State == WebSocketState.Open;

        public async Task ConnectAsync(string url = null)
        {
            if (url != null) serverUrl = url;

            _cts?.Cancel();
            _cts?.Dispose();
            _cts = new CancellationTokenSource();

            _ws?.Dispose();
            _ws = new ClientWebSocket();

            try
            {
                await _ws.ConnectAsync(new Uri(serverUrl), _cts.Token);
                Debug.Log($"[WebSocketClient] Connected to {serverUrl}");
                _ = ReceiveLoopAsync(_cts.Token);
            }
            catch (Exception e)
            {
                Debug.LogError($"[WebSocketClient] Connect failed: {e.Message}");
            }
        }

        public void Send(int eventId)
        {
            if (!IsConnected) return;
            var msg = new WsMessage { type = "event", @event = eventId };
            _ = SendAsync(JsonUtility.ToJson(msg));
        }

        // Returns an unsubscribe action
        public Action On(int eventId, Action<int> callback)
        {
            if (!_listeners.ContainsKey(eventId))
                _listeners[eventId] = new List<Action<int>>();
            _listeners[eventId].Add(callback);
            return () =>
            {
                if (_listeners.TryGetValue(eventId, out var list))
                    list.Remove(callback);
            };
        }

        public void Disconnect()
        {
            _cts?.Cancel();
            _ws?.Abort();
            _ws?.Dispose();
            _ws = null;
        }

        private void Update()
        {
            while (_queue.TryDequeue(out var msg))
            {
                if (_listeners.TryGetValue(msg.@event, out var callbacks))
                    foreach (var cb in callbacks)
                        cb?.Invoke(msg.@event);
            }
        }

        private void OnDestroy() => Disconnect();

        private async Task ReceiveLoopAsync(CancellationToken ct)
        {
            var buffer = new byte[4096];
            var sb = new StringBuilder();

            try
            {
                while (_ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
                {
                    sb.Clear();
                    WebSocketReceiveResult result;
                    do
                    {
                        result = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
                        if (result.MessageType == WebSocketMessageType.Close) return;
                        sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                    } while (!result.EndOfMessage);

                    var msg = JsonUtility.FromJson<WsMessage>(sb.ToString());
                    if (msg != null && msg.type == "event")
                        _queue.Enqueue(msg);
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception e)
            {
                Debug.LogError($"[WebSocketClient] Receive error: {e.Message}");
            }
            finally
            {
                Debug.Log("[WebSocketClient] Disconnected");
            }
        }

        private async Task SendAsync(string json)
        {
            try
            {
                var bytes = Encoding.UTF8.GetBytes(json);
                await _ws.SendAsync(
                    new ArraySegment<byte>(bytes),
                    WebSocketMessageType.Text,
                    endOfMessage: true,
                    _cts?.Token ?? CancellationToken.None
                );
            }
            catch (Exception e)
            {
                Debug.LogError($"[WebSocketClient] Send error: {e.Message}");
            }
        }
    }
}
