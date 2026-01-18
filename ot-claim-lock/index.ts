import { opendiscord, api, utilities } from "#opendiscord";
import { TextChannel, PermissionOverwriteOptions, PermissionsBitField } from "discord.js";

if (utilities.project !== "openticket") {
    throw new api.ODPluginError("ot-claim-lock is only valid for Open Ticket.");
}

const PLUGIN_ID = "ot-claim-lock";
const CONFIG_ID = `${PLUGIN_ID}:config`;

function getCfg() {
    return opendiscord.configs.get(CONFIG_ID)!;
}

// Create config on load
opendiscord.events.get("onConfigLoad").listen((manager: any) => {
    manager.add(new api.ODJsonConfig(CONFIG_ID, "config.json", `./plugins/${PLUGIN_ID}/`));
});

// -------------------- Helpers --------------------

function saveSnapshot(channelId: string, roleId: string, overwrites: any) {
    const cfg = getCfg().data;
    if (!cfg.snapshots) cfg.snapshots = {};
    if (!cfg.snapshots[channelId]) cfg.snapshots[channelId] = {};
    cfg.snapshots[channelId][roleId] = overwrites;
    getCfg().save();
}

function getSnapshot(channelId: string) {
    const cfg = getCfg().data;
    return cfg.snapshots?.[channelId] ?? null;
}

function clearSnapshot(channelId: string) {
    const cfg = getCfg().data;
    if (cfg.snapshots && cfg.snapshots[channelId]) {
        delete cfg.snapshots[channelId];
        getCfg().save();
    }
}

function isAdmin(memberRoles: string[], ticketAdminRoles: string[]) {
    return memberRoles.some(r => ticketAdminRoles.includes(r));
}

// -------------------- Claim / Unclaim --------------------

export async function applyClaimLock(channel: TextChannel, claimerId: string, memberRoles: string[]) {
    const cfg = getCfg().data;
    if (!cfg.claimed) cfg.claimed = {};
    const ticketAdminRoles: string[] = cfg.ticketAdminRoles || [];

    // Snapshot roles before locking
    for (const roleId of ticketAdminRoles) {
        if (memberRoles.includes(roleId)) continue; // skip claimer
        const prev = channel.permissionOverwrites.cache.get(roleId);
        if (prev) saveSnapshot(channel.id, roleId, prev.toJSON());
        await channel.permissionOverwrites.edit(roleId, {
            ViewChannel: false,
            SendMessages: false,
            ReadMessageHistory: false
        } as PermissionOverwriteOptions);
    }

    // Allow claimer
    await channel.permissionOverwrites.edit(claimerId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
    } as PermissionOverwriteOptions);

    cfg.claimed[channel.id] = { claimerId };
    getCfg().save();
}

export async function releaseClaimLock(channel: TextChannel) {
    const cfg = getCfg().data;
    const snap = getSnapshot(channel.id);

    // Restore snapshots
    if (snap) {
        for (const [roleId, prev] of Object.entries(snap)) {
            try {
                await channel.permissionOverwrites.edit(roleId, prev as any);
            } catch {}
        }
    }

    clearSnapshot(channel.id);

    // Remove claimer overwrite
    const claimed = cfg.claimed?.[channel.id];
    if (claimed?.claimerId) {
        try {
            await channel.permissionOverwrites.delete(claimed.claimerId);
        } catch {}
    }

    if (cfg.claimed && cfg.claimed[channel.id]) delete cfg.claimed[channel.id];
    getCfg().save();
}

// -------------------- Events --------------------

// Hook into OT claim/unclaim events
function on(name: string, handler: (channel: TextChannel, userId: string, memberRoles?: string[]) => void) {
    const ev = opendiscord.events.get(name);
    if (!ev) return;

    ev.listen(async (ticket: any, userId: string, channel: TextChannel, ...rest: any[]) => {
        if (!channel || !userId) return;

        let roles: string[] = [];
        if (rest[0]?.member?.roles?.cache) roles = Array.from(rest[0].member.roles.cache.keys());
        await handler(channel, userId, roles);
    });
}

// OT v4.1.1 events
on("onTicketClaim", applyClaimLock);
on("onTicketUnclaim", releaseClaimLock);
