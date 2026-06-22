using Newtonsoft.Json.Linq;
using System;
using UnityEngine;
using UnityWebSocketStack;

public class WebSocketExample : MonoBehaviour
{
    private WebSocketClient _wsClient;
    private Action _unsubscribeEvent1;

    private async void Start()
    {
        _wsClient = gameObject.AddComponent<WebSocketClient>();
        await _wsClient.ConnectAsync("ws://localhost:8080");

        _unsubscribeEvent1 = _wsClient.On(1, OnEvent1);
        _wsClient.On(2, OnEvent2);
        _wsClient.On(3, OnEvent3); // HuskyLens face count
    }

    private void Update()
    {
        if (!_wsClient.IsConnected) return;

        if (Input.GetKeyDown(KeyCode.Space))
        {
            _wsClient.Send(1);
        }

        if (Input.GetKeyDown(KeyCode.E))
        {
            _wsClient.Send(2, new JObject { ["message"] = "hello" });
        }
    }

    private void OnEvent1(WebSocketEvent e) =>
        Debug.Log($"Event {e.Id}");

    private void OnEvent2(WebSocketEvent e) =>
        Debug.Log($"Event {e.Id} — message: {e.Get<string>("message")}");

    private void OnEvent3(WebSocketEvent e) =>
        Debug.Log($"Detected ({e.Get<string>("mode")}): {e.Get<int>("count")}");

    private void OnDestroy()
    {
        _unsubscribeEvent1?.Invoke();
        _wsClient?.Disconnect();
    }
}
