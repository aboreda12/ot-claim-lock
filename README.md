This plugin introduces the following behavior:

1. Locks the claim access to a single staff member until they unclaim.
2. When claimed, hides all ticket admins defined in the plugin config.
3. Fix for allowing staff to be added to a claimed ticket:
   In `src/commands/add.ts`, remove the following block:

```
const participants = await opendiscord.tickets.getAllTicketParticipants(ticket)
if (!participants || participants.find((p) => p.user.id == data.id)){
    //... send error ...
    return cancel()
}
```

This allows staff to be re-added after being hidden by the claim lock.

4. It is recommended to remove staff role IDs from the main bot setup and use only the plugin config for ticket admin roles.

5. One remaining issue:
   After unclaiming, all ticket admins should regain full read/write access, but this part is still incomplete. Assistance is welcome.
