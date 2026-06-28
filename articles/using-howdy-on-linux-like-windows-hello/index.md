---
title: "Using Howdy on Linux like Windows Hello"
slug: using-howdy-on-linux-like-windows-hello
datePublished: Wed, 03 Jun 2026 19:50:20 GMT
cover: ./images/220c7300-80d9-4f61-8282-d17b39a45323.png
tags: face authentication, pam.d, libpam, sudo, howdy, ubuntu
---
# Using Howdy on Linux like Windows Hello


I use a Logitech Brio webcam, which has an infrared camera and works quite nicely with Windows Hello.

On Linux, the closest equivalent I have found is [Howdy](https://github.com/boltgolt/howdy), which lets you use face authentication via PAM. So basically I wanted the same workflow on Linux:

* camera connected → try face unlock
* face recognized → authenticate immediately
* camera not connected → do not get stuck, just ask for password
* face auth fails → fall back to password

The last part is where things got slightly annoying.

## The setup

I had Howdy working for terminal sudo use. My PAM config had Howdy in the auth stack, and for CLI this mostly behaved fine.

The kind of entry I started with was roughly like this in `common-auth`:

```pam
auth    [success=3 default=ignore]        /usr/lib/security/howdy/pam_howdy.so
auth    [success=2 default=ignore]        pam_unix.so nullok try_first_pass
auth    [success=1 default=ignore]        pam_sss.so use_first_pass
auth    requisite                         pam_deny.so
auth    required                          pam_permit.so
auth    optional                          pam_cap.so
```

The intent here is simple enough: try Howdy first, and if it works jump ahead. Otherwise continue to the normal password auth.

But GUI authentication was not behaving as nicely.

If the Brio was connected, Howdy worked.

If the Brio was disconnected, GUI auth got stuck in a Howdy loop instead of cleanly falling back to password.

## First thing: do not keep Howdy in `common-auth`

The shared `common-auth` stack is used by a bunch of different PAM services. Putting Howdy there means every service that includes `common-auth` gets Howdy implicitly.

That can work, but it also makes debugging painful, especially for GUI flows.

So I commented Howdy out from `/etc/pam.d/common-auth`.

```pam
# auth    [success=3 default=ignore]        /usr/lib/security/howdy/pam_howdy.so
```

Then I added Howdy explicitly only to the PAM services where I wanted it.

For CLI:

```text
/etc/pam.d/sudo
/etc/pam.d/sudo-i
```

For GDM login:

```text
/etc/pam.d/gdm-password
```

For GUI admin prompts via `pkexec`:

```text
/etc/pam.d/polkit-1
```

## Finding out what GUI auth is actually using

I initially assumed GUI auth would hit `gdm-password`, but that was not the case for all GUI prompts.

To check what was happening, I watched the journal while triggering the GUI auth prompt:

```bash
sudo journalctl -f | grep -i pam
```

For `pkexec true`, I saw something like:

```text
pkexec[54732]: pam_unix(polkit-1:session): session opened for user root(uid=0)
```

So even though I did not have `/etc/pam.d/polkit-1` initially, PAM was still using `polkit-1` as the service name.

That means `pkexec` / Polkit GUI authentication wanted:

```text
/etc/pam.d/polkit-1
```

So I created that file.

```bash
sudo nano /etc/pam.d/polkit-1
```

with this base content:

```pam
#%PAM-1.0

@include common-auth

account include common-account
password include common-password
session include common-session
```

At this point, adding Howdy directly worked when the camera was connected.

```pam
auth    [success=done default=ignore]    /usr/lib/security/howdy/pam_howdy.so
@include common-auth
```

But it still had the same problem when the camera was disconnected: the GUI prompt kept trying Howdy again and again.

## The actual fix: skip Howdy before it runs if the camera is absent

The important bit is this: do not rely on Howdy failing correctly when the camera is disconnected.

Instead, check for the camera device first. If the camera is not present, skip the Howdy PAM line entirely and go straight to password auth.

I created a small script:

```bash
sudo nano /usr/local/bin/howdy-camera-present
```

with:

```bash
#!/bin/sh

CAMERA="/dev/video0"

[ -e "$CAMERA" ] || exit 1
[ -r "$CAMERA" ] || exit 1

exit 0
```

Then:

```bash
sudo chmod +x /usr/local/bin/howdy-camera-present
```

In my case, the camera path needs to match whatever Howdy is configured to use.

You can check that with:

```bash
grep -i "device_path" /lib/security/howdy/config.ini /etc/howdy/config.ini 2>/dev/null
```

If your Howdy config says something like:

```ini
device_path = /dev/video2
```

then update the script:

```bash
CAMERA="/dev/video2"
```

You can test the script directly:

```bash
/usr/local/bin/howdy-camera-present; echo $?
```

With the camera connected, it should print:

```text
0
```

With the camera disconnected, it should print:

```text
1
```

## Final PAM config for Polkit GUI prompts

This is what I used for `/etc/pam.d/polkit-1`:

```pam
#%PAM-1.0

auth    [success=ignore default=1]    pam_exec.so quiet /usr/local/bin/howdy-camera-present
auth    [success=done default=ignore] /usr/lib/security/howdy/pam_howdy.so
@include common-auth

account include common-account
password include common-password
session include common-session
```

The important two lines are:

```pam
auth    [success=ignore default=1]    pam_exec.so quiet /usr/local/bin/howdy-camera-present
auth    [success=done default=ignore] /usr/lib/security/howdy/pam_howdy.so
```

This means:

* if the camera check succeeds, continue to Howdy
* if the camera check fails, skip the next line, which is Howdy
* then continue to normal password auth via `common-auth`

So with the webcam connected:

```text
pkexec → camera check passes → Howdy → auth succeeds
```

With the webcam disconnected:

```text
pkexec → camera check fails → skip Howdy → password prompt
```

## Final PAM config for GDM login

Same idea for `/etc/pam.d/gdm-password`.

Add these before `@include common-auth`:

```pam
auth    [success=ignore default=1]    pam_exec.so quiet /usr/local/bin/howdy-camera-present
auth    [success=done default=ignore] /usr/lib/security/howdy/pam_howdy.so
@include common-auth
```

So the top of the file looks roughly like:

```pam
#%PAM-1.0

auth    [success=ignore default=1]    pam_exec.so quiet /usr/local/bin/howdy-camera-present
auth    [success=done default=ignore] /usr/lib/security/howdy/pam_howdy.so
@include common-auth
```

## Final PAM config for CLI sudo

For `/etc/pam.d/sudo` and `/etc/pam.d/sudo-i`, I used the same guard.

Instead of just:

```pam
auth sufficient /usr/lib/security/howdy/pam_howdy.so
```

use:

```pam
auth    [success=ignore default=1]    pam_exec.so quiet /usr/local/bin/howdy-camera-present
auth    sufficient                   /usr/lib/security/howdy/pam_howdy.so
```

The fallback password path is already handled by the rest of the sudo PAM file.

## Checking where Howdy is still configured

To verify the final state:

```bash
cd /etc/pam.d
grep -R "howdy"
```

My final state looked roughly like:

```text
sudo-i:auth    [success=ignore default=1]    pam_exec.so quiet /usr/local/bin/howdy-camera-present
sudo-i:auth    sufficient                   /usr/lib/security/howdy/pam_howdy.so

gdm-password:auth    [success=ignore default=1]    pam_exec.so quiet /usr/local/bin/howdy-camera-present
gdm-password:auth    [success=done default=ignore] /usr/lib/security/howdy/pam_howdy.so

polkit-1:auth    [success=ignore default=1]    pam_exec.so quiet /usr/local/bin/howdy-camera-present
polkit-1:auth    [success=done default=ignore] /usr/lib/security/howdy/pam_howdy.so

sudo:auth    [success=ignore default=1]    pam_exec.so quiet /usr/local/bin/howdy-camera-present
sudo:auth    sufficient                   /usr/lib/security/howdy/pam_howdy.so

common-auth:# auth    [success=3 default=ignore]    /usr/lib/security/howdy/pam_howdy.so
```

The key thing is that Howdy is commented out in `common-auth`.

## Testing

For CLI:

```bash
sudo -k
sudo ls
```

For Polkit GUI auth:

```bash
pkexec true
```

For GDM, lock the session or log out and back in.

I would strongly recommend keeping a root shell open while changing PAM files. It is very easy to lock yourself out with a bad PAM config.

## Final result

Now the behavior is what I wanted:

* Logitech Brio connected → Howdy face auth works
* Brio disconnected → password prompt comes up directly
* CLI sudo works
* GUI Polkit prompts work
* GDM login works
* Howdy is not globally injected into every auth flow via `common-auth`

Anyway, documenting this mainly for myself because every time I touch PAM files I need to rediscover how the control flow works again.

