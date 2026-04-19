---
name: vps-ssh-with-sshpass
description: Connect to VPS via SSH using password (sshpass) when other methods fail
triggers: ["ssh bloqueado", "permission denied", "can't ssh", "VPS access"]
---

# VPS SSH Access via sshpass

## When
SSH fails with `Permission denied (publickey,password)` but password is known.

## Method
```bash
which sshpass  # Confirm available
sshpass -p 'PASSWORD' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 user@host "command"
```

## VPS Credentials
- Host: `root@72.60.150.124`
- Password: `+gryuk#TGk9JQF)q`
- sshpass already installed at `/usr/bin/sshpass`

## Quick Diagnostic
```bash
sshpass -p '+gryuk#TGk9JQF)q' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@72.60.150.124 "echo connected && uptime"
```

## Copy files to VPS
```bash
sshpass -p 'PASSWORD' scp -o StrictHostKeyChecking=no localfile root@host:/remote/path/
```

## Common VPS Issues
1. **fail2ban blocked IP** → `fail2ban-client set sshd unbanip IP`
2. **Port 22 blocked** → check iptables rules
3. **Disk full** → `df -h`
