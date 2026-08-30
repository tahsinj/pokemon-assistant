/*
 * Translates Cobblemon's in-game event objects into ObjectNode payloads
 * matching the wire protocol in src/shared/cobblemonProtocol.ts.
 *
 * Returns a list because a single Cobblemon event sometimes fans out into
 * multiple wire frames (e.g. a "BattleStarted" emits one PokemonRevealed
 * per active slot, plus the BattleStarted itself).
 *
 * This file is a REFERENCE SCAFFOLD. Cobblemon event types vary by version;
 * adjust the field accesses to match your target release.
 */

package com.pokemonassistant.mod

import com.fasterxml.jackson.databind.node.ObjectNode
import com.pokemonassistant.mod.AssistantBridge.Companion.newPayload

// Placeholders - replace with your release's actual types.
import com.cobblemon.mod.common.api.events.battles.BattleStartedPreEvent
import com.cobblemon.mod.common.api.events.battles.BattleVictoryEvent
import com.cobblemon.mod.common.api.events.battles.BattleFaintedEvent

class EventTranslator {

    fun battleStarted(event: BattleStartedPreEvent): List<ObjectNode> {
        val out = mutableListOf<ObjectNode>()
        out.add(newPayload("battle-started").apply {
            put("format", inferFormat(event))
            putObject("startingActive").apply {
                put("player", 0)
                put("opponent", 0)
            }
        })
        // For each pokemon already revealed at start, emit a `pokemon-revealed`.
        // out.add(...)
        return out
    }

    fun battleEnded(event: BattleVictoryEvent): List<ObjectNode> {
        return listOf(newPayload("battle-ended").apply {
            put("winner", winnerSide(event))
        })
    }

    fun fainted(event: BattleFaintedEvent): List<ObjectNode> {
        val obj = newPayload("fainted")
        obj.putObject("target").apply {
            put("side", sideOf(event))
            put("slot", slotOf(event))
        }
        return listOf(obj)
    }

    // ----------------- helpers (stubs - fill in per release) -----------------

    private fun inferFormat(event: BattleStartedPreEvent): String = "singles"
    private fun winnerSide(event: BattleVictoryEvent): String = "player"
    private fun sideOf(event: BattleFaintedEvent): String = "opponent"
    private fun slotOf(event: BattleFaintedEvent): Int = 0
}
