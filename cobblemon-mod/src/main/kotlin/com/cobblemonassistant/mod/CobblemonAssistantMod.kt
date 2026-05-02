/*
 * Cobblemon Assistant - companion Fabric mod entry point.
 *
 * This file is a REFERENCE SCAFFOLD. It demonstrates the shape of the
 * integration but does NOT compile cleanly against an arbitrary Cobblemon
 * release without adjusting the import paths to match that release's
 * `cobblemonsCompiledKtCompiled` package layout. See README.md for setup.
 */

package com.cobblemonassistant.mod

import net.fabricmc.api.ModInitializer
import org.slf4j.LoggerFactory
import java.nio.file.Files
import java.nio.file.Paths
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.node.ObjectNode

// NOTE: the Cobblemon event imports below are placeholders. Adjust to match
// the API surface of the Cobblemon release you target. As of writing the
// event bus lives at `com.cobblemon.mod.common.api.events.CobblemonEvents`.
import com.cobblemon.mod.common.api.events.CobblemonEvents
import com.cobblemon.mod.common.api.events.battles.BattleStartedPreEvent
import com.cobblemon.mod.common.api.events.battles.BattleVictoryEvent
import com.cobblemon.mod.common.api.events.battles.BattleFaintedEvent

class CobblemonAssistantMod : ModInitializer {
    private val log = LoggerFactory.getLogger(MOD_ID)
    private lateinit var bridge: AssistantBridge
    private lateinit var translator: EventTranslator

    override fun onInitialize() {
        log.info("$MOD_ID initializing")

        val config = loadConfig()
        bridge = AssistantBridge(config.url, config.reconnectMs, log)
        translator = EventTranslator()

        registerHooks()
        bridge.start()
        bridge.sendHello(playerUUID())
    }

    private fun registerHooks() {
        CobblemonEvents.BATTLE_STARTED_PRE.subscribe { event: BattleStartedPreEvent ->
            translator.battleStarted(event).forEach(bridge::sendEvent)
        }
        CobblemonEvents.BATTLE_VICTORY.subscribe { event: BattleVictoryEvent ->
            translator.battleEnded(event).forEach(bridge::sendEvent)
        }
        CobblemonEvents.BATTLE_FAINTED.subscribe { event: BattleFaintedEvent ->
            translator.fainted(event).forEach(bridge::sendEvent)
        }
        // Additional hooks: MOVE_USED, DAMAGE_TAKEN, STATUS_APPLIED, etc.
        // See README.md -> "Wire protocol" for the full message catalogue.
    }

    private fun playerUUID(): String {
        // In a real impl, ask Minecraft.getInstance().player.uuid.toString().
        // Returning a synthesized UUID here keeps the scaffold compile-clean.
        return "00000000-0000-0000-0000-000000000000"
    }

    private fun loadConfig(): Config {
        val configPath = Paths.get(System.getProperty("user.home"), ".cobblemon-assistant.json")
        if (!Files.exists(configPath)) {
            return Config()
        }
        return try {
            val node = ObjectMapper().readTree(configPath.toFile()) as ObjectNode
            Config(
                url = node.get("url")?.asText() ?: Config().url,
                reconnectMs = node.get("reconnectMs")?.asLong() ?: Config().reconnectMs,
            )
        } catch (e: Exception) {
            log.warn("failed to read $configPath: ${e.message}")
            Config()
        }
    }

    data class Config(
        val url: String = "ws://127.0.0.1:8788/cobblemon",
        val reconnectMs: Long = 2000,
    )

    companion object {
        const val MOD_ID = "cobblemon_assistant"
        const val PROTOCOL_VERSION = 1
    }
}
