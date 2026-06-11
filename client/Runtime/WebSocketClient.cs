using System;
using System.Collections.Generic;
using UnityEngine;
using WebSocketSharp;
using Newtonsoft.Json;

[System.Serializable]
public class WebSocketEvent
{
    public string type;
    public int @event;
}

public class WebSocketClient : MonoBehaviour
{
    private WebSocket ws;
    private string url = "ws://localhost:8081";
    private bool isConnected = false;
    private Queue<WebSocketEvent> messageQueue = new Queue<WebSocketEvent>();
    private Dictionary<int, List<System.Action<WebSocketEvent>>> listeners =
        new Dictionary<int, List<System.Action<WebSocketEvent>>>();

    public bool IsConnected => isConnected;

    public void Connect(string serverUrl = null)
    {
        if (serverUrl != null)
            url = serverUrl;

        try
        {
            ws = new WebSocket(url);

            ws.OnOpen += () =>
            {
                isConnected = true;
                Debug.Log("WebSocket connected");
            };

            ws.OnMessage += (sender, e) =>
            {
                try
                {
                    WebSocketEvent data = JsonConvert.DeserializeObject<WebSocketEvent>(e.Data);
                    if (data != null && data.type == "event")
                    {
                        messageQueue.Enqueue(data);
                    }
                }
                catch (Exception ex)
                {
                    Debug.LogError($"Failed to parse message: {ex.Message}");
                }
            };

            ws.OnError += (sender, e) =>
            {
                Debug.LogError($"WebSocket error: {e.Message}");
            };

            ws.OnClose += (sender, e) =>
            {
                isConnected = false;
                Debug.Log("WebSocket disconnected");
            };

            ws.Connect();
        }
        catch (Exception ex)
        {
            Debug.LogError($"Failed to connect: {ex.Message}");
        }
    }

    public void Disconnect()
    {
        if (ws != null)
        {
            ws.Close();
            isConnected = false;
        }
    }

    public void Send(int eventId)
    {
        if (isConnected && ws != null)
        {
            WebSocketEvent message = new WebSocketEvent
            {
                type = "event",
                @event = eventId
            };
            string json = JsonConvert.SerializeObject(message);
            ws.Send(json);
        }
    }

    public void On(int eventId, System.Action<WebSocketEvent> callback)
    {
        if (!listeners.ContainsKey(eventId))
        {
            listeners[eventId] = new List<System.Action<WebSocketEvent>>();
        }
        listeners[eventId].Add(callback);
    }

    private void Update()
    {
        while (messageQueue.Count > 0)
        {
            WebSocketEvent @event = messageQueue.Dequeue();

            if (listeners.ContainsKey(@event.@event))
            {
                foreach (var callback in listeners[@event.@event])
                {
                    callback?.Invoke(@event);
                }
            }
        }
    }

    private void OnDestroy()
    {
        Disconnect();
    }
}
