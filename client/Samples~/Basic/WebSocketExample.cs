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
    }

    private void Update()
    {
        if (!_wsClient.IsConnected) return;

        if (Input.GetKeyDown(KeyCode.Space))
        {
            _wsClient.Send(1);
            Debug.Log("Sent event 1");
        }

        if (Input.GetKeyDown(KeyCode.E))
        {
            _wsClient.Send(2);
            Debug.Log("Sent event 2");
        }
    }

    private void OnEvent1(int eventId) => Debug.Log($"Received event {eventId}");
    private void OnEvent2(int eventId) => Debug.Log($"Received event {eventId}");

    private void OnDestroy()
    {
        _unsubscribeEvent1?.Invoke();
        _wsClient?.Disconnect();
    }
}
