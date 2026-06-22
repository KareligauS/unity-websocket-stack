using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace UnityWebSocketStack
{
    // Represents a received {"type":"event","event":N,"data":{...}} message.
    public class WebSocketEvent
    {
        public int Id { get; }

        // The "data" object from the message. Empty JObject if the field was absent.
        public JObject Data { get; }

        internal WebSocketEvent(int id, JObject raw)
        {
            Id = id;
            Data = raw["data"] as JObject ?? new JObject();
        }

        // Type-safe read from data: e.Get<int>("faces"), e.Get<string>("label"), etc.
        // Returns defaultValue when the key is absent or the cast fails.
        public T Get<T>(string key, T defaultValue = default)
        {
            try { return Data.ContainsKey(key) ? Data[key].ToObject<T>() : defaultValue; }
            catch { return defaultValue; }
        }

        public bool Has(string key) => Data.ContainsKey(key);

        // Raw JToken access for nested structures: e["nested"]["child"]
        public JToken this[string key] => Data[key];
    }

    public class WebSocketClient : MonoBehaviour
    {
        [SerializeField] private string serverUrl = "ws://localhost:8080";

        private ClientWebSocket _ws;
        private CancellationTokenSource _cts;
        private readonly ConcurrentQueue<WebSocketEvent> _queue = new ConcurrentQueue<WebSocketEvent>();
        private readonly Dictionary<int, List<Action<WebSocketEvent>>> _listeners = new Dictionary<int, List<Action<WebSocketEvent>>>();

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

        // Send {"type":"event","event":N}
        public void Send(int eventId) => Send(eventId, null);

        // Send {"type":"event","event":N,"data":{...}}
        public void Send(int eventId, JObject data)
        {
            if (!IsConnected) return;
            var msg = new JObject { ["type"] = "event", ["event"] = eventId };
            if (data != null) msg["data"] = data;
            _ = SendAsync(msg.ToString(Newtonsoft.Json.Formatting.None));
        }

        // Returns an unsubscribe action.
        public Action On(int eventId, Action<WebSocketEvent> callback)
        {
            if (!_listeners.ContainsKey(eventId))
                _listeners[eventId] = new List<Action<WebSocketEvent>>();
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
            while (_queue.TryDequeue(out var evt))
            {
                if (_listeners.TryGetValue(evt.Id, out var callbacks))
                    foreach (var cb in callbacks)
                        cb?.Invoke(evt);
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

                    try
                    {
                        var obj = JObject.Parse(sb.ToString());
                        if (obj["type"]?.Value<string>() == "event" && obj["event"] != null)
                            _queue.Enqueue(new WebSocketEvent(obj["event"].Value<int>(), obj));
                    }
                    catch { /* malformed JSON — skip */ }
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
