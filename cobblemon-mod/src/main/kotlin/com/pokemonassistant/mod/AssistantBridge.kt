/*
 * Minimal WebSocket client used by the Cobblemon-side mod to push JSON
 * messages to the desktop Assistant.
 *
 * Reference scaffold - production deployments should add backoff,
 * jittered reconnect, and per-frame retry logic.
 */

package com.pokemonassistant.mod

import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.JsonNodeFactory
import com.fasterxml.jackson.databind.node.ObjectNode
import org.slf4j.Logger
import java.net.URI
import java.net.http.HttpClient
import java.net.http.WebSocket
import java.util.concurrent.CompletionStage
import java.util.concurrent.atomic.AtomicInteger

class AssistantBridge(
    private val url: String,
    private val reconnectMs: Long,
    private val log: Logger,
) {
    private val mapper = ObjectMapper()
    private val seq = AtomicInteger(0)
    @Volatile private var socket: WebSocket? = null
    @Volatile private var stopped = false
    private val battleId: String = java.util.UUID.randomUUID().toString()

    fun start() {
        Thread({ connectLoop() }, "pokemon-assistant-ws").apply {
            isDaemon = true
            start()
        }
    }

    fun stop() {
        stopped = true
        socket?.sendClose(WebSocket.NORMAL_CLOSURE, "mod-stop")
    }

    fun sendHello(playerUUID: String) {
        val obj = mapper.createObjectNode()
        obj.put("type", "hello")
        obj.put("protocolVersion", CobblemonBridgeMod.PROTOCOL_VERSION)
        obj.put("modId", "pokemon-assistant-mod-0.1.0")
        obj.put("cobblemonVersion", "1.6.0")
        obj.put("minecraftVersion", "1.20.1")
        obj.put("playerUUID", playerUUID)
        send(obj)
    }

    fun sendEvent(payload: ObjectNode) {
        val envelope = mapper.createObjectNode()
        envelope.put("type", "event")
        envelope.put("protocolVersion", CobblemonBridgeMod.PROTOCOL_VERSION)
        envelope.put("seq", seq.incrementAndGet())
        envelope.put("timestamp", System.currentTimeMillis())
        envelope.put("battleId", battleId)
        envelope.set<JsonNode>("payload", payload)
        send(envelope)
    }

    private fun send(node: ObjectNode) {
        val ws = socket ?: return
        val json = mapper.writeValueAsString(node)
        ws.sendText(json, true)
    }

    private fun connectLoop() {
        while (!stopped) {
            try {
                val client = HttpClient.newHttpClient()
                val builder = client.newWebSocketBuilder()
                socket = builder.buildAsync(URI.create(url), Listener()).get()
                log.info("assistant: connected to $url")
                // Block this thread until the socket is closed.
                while (!stopped && socket != null) {
                    Thread.sleep(500)
                }
            } catch (e: Exception) {
                log.warn("assistant: connect failed: ${e.message}")
            }
            if (stopped) return
            try { Thread.sleep(reconnectMs) } catch (ie: InterruptedException) { return }
        }
    }

    private inner class Listener : WebSocket.Listener {
        override fun onOpen(webSocket: WebSocket) {
            super.onOpen(webSocket)
            webSocket.request(1)
        }
        override fun onClose(webSocket: WebSocket, statusCode: Int, reason: String?): CompletionStage<*>? {
            log.info("assistant: closed ($statusCode) $reason")
            socket = null
            return null
        }
        override fun onError(webSocket: WebSocket, error: Throwable) {
            log.warn("assistant: socket error: ${error.message}")
            socket = null
        }
    }

    companion object {
        fun newPayload(kind: String): ObjectNode {
            val obj = ObjectNode(JsonNodeFactory.instance)
            obj.put("kind", kind)
            return obj
        }
    }
}
