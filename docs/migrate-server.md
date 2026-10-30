# Migrate to a new server or storage backend without downtime

Use this when the new machine cannot reach the Redis or Upstash database you
already have, or when you want a different database: another Redis, another
Upstash database, or a switch between the two.

People keep the same website address. Links already sent still open. The site
stays up during the move.

You run two PassED instances at the same time. The new one has its own empty
database. It can be another machine, or a second process next to the current
one. The old instance keeps the database it already has.
[Traefik](https://doc.traefik.io/traefik/) 3.7 or newer sits on the public HTTPS
address and chooses which instance answers.

Nothing is copied. A share stays in the database that saved it.

```text
browser  --HTTPS-->  Traefik  --+-->  new PassED  -->  new Redis or Upstash
                                |
                                +-->  old PassED  -->  old Redis or Upstash
                                      (only when the new instance does not have the link)
```

## What people see

After the move:

- The website (pages, CSS, JavaScript, translations) comes from the **new**
  instance.
- A new share is saved on the **new** instance.
- An old link is tried on the new instance first. If that instance answers "not
  found", Traefik asks the **old** instance.

The link address does not change. The secret is the part after `#`
(`#id:key:iv`). The browser never sends that part, so neither server can read
the password.

The old instance only serves links it already has. After its public port is
closed, new shares go to the new instance alone.

## Before you start

- Run the **same PassED version** on both instances until the old one is gone.
  The browser loads the new instance's page, and that page talks to whichever
  instance still has the link. Upgrade before this move, or after the old
  database is empty.
- Give the new instance its **own empty** database, and set `PASSED_STORE_TYPE`
  to `redis` or `upstash` for that database. Two Redis databases, two Upstash
  databases, or one of each all work.
- Point the new instance at that new database only. A copied key can spend a
  view on one side while the other side still has that view, and it can leave a
  share in the database you are about to turn off.
- Keep the old database as it is: the Redis volume, the AOF file, or the Upstash
  database.
- Both instances listen on the private network, port 3000. After the move, only
  Traefik is reachable from the internet.
- Serve the site over HTTPS. The browser encrypts the password with the Web
  Crypto API, which works on HTTPS and on localhost.

## Where a request goes

| What the browser does | Where it goes                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Load the site         | New instance                                                                                                     |
| Create a share        | New instance. A full database or a rejected request is shown as that error.                                      |
| Open a link           | New instance first. On "not found" (404), Traefik asks the old instance. A server error is shown to the browser. |

Opening a link is two requests. The page asks whether the link is still there,
and only then fetches the secret. "Not found" does not use up a view. The
instance that has the link uses one view, as it did before the move. A
successful answer stops there.

A server error stops there too. The page shows the error, and the person can
open the original link again. Sending that error to the old instance would turn
it into "not found" for every share that exists only on the new database. The
page treats "not found" as a link that is gone, and it has already removed the
part after `#`, so a refresh does not try again.

Leave caching off. PassED already tells browsers not to store API answers, and
the page needs the `X-Remaining-Views` and `X-Expires-In` headers left as they
are.

Leave health checks off the services below. A health check can mark the new
instance down and send every open to the old instance until the check passes.
The home page is static, so it stays up when the database is down, and a check
of `/` would miss that. Shares on the new instance would then look missing.

| What is down                              | What people see                                                                                                                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The new process                           | The website is down. Pages are not loaded from the old instance. An open tab shows a server error for every link, old or new, until the new process answers. Creating a share needs the new process. |
| The new database, while the process is up | The website still loads. Creating a share fails with the database error. Opening a link fails with a server error too, including an old link. The share stays where it was saved.                    |

## Traefik configuration

`passed-new` and `passed-old` are the private addresses of the two instances.
Replace the certificate paths. If Traefik already gets certificates for you,
keep that, and leave `tls: {}` on the routers.

`passed-web` is the website and "create a share". It always uses the new
instance. `passed-read` is opening a link: try the new instance, and on 404 try
the old one for that request only. The next open tries the new instance again.

Start Traefik after both home pages answer. That check is yours. This config
does not probe `/`.

`/etc/traefik/traefik.yml`:

```yaml
entryPoints:
  websecure:
    address: ":443"

providers:
  file:
    filename: /etc/traefik/passed.yml

accessLog: {}
```

`/etc/traefik/passed.yml`:

```yaml
tls:
  certificates:
    - certFile: /certs/fullchain.pem
      keyFile: /certs/privkey.pem

http:
  routers:
    # The website and "create a share" always go here.
    passed-web:
      rule: "PathPrefix(`/`)"
      priority: 1
      entryPoints: [websecure]
      service: passed-new
      tls: {}

    # Opening a link. The page checks the link, then fetches it.
    passed-read:
      rule: "PathPrefix(`/api/password/`) && (Method(`GET`) || Method(`HEAD`))"
      priority: 100
      entryPoints: [websecure]
      service: passed-read
      tls: {}

  services:
    passed-new:
      loadBalancer:
        servers:
          - url: "http://passed-new:3000"

    passed-old:
      loadBalancer:
        servers:
          - url: "http://passed-old:3000"

    passed-read:
      failover:
        service: passed-new
        fallback: passed-old
        errors:
          status:
            # Not found on this instance. The old instance may still have it.
            - "404"
```

## Switch over

There are two waits. First let the old DNS TTL expire, then change the name.
Then let the new short TTL expire, and only then close the old public port.

1. **Lower the DNS TTL** of the public name. Write down the TTL that was in
   effect before this change. Steps 2 and 3 can run while you wait for that old
   TTL to expire.
2. **Start the new PassED** and its empty database. Set `PASSED_STORE_TYPE` and
   the URL and token for **that** database. Keep its port off the internet.
3. **Start Traefik** with the config above. Before changing DNS, open the site
   through Traefik from your own machine:

   ```sh
   curl --resolve passed.example:443:<traefik-ip> https://passed.example/
   ```

4. **Point the public name at Traefik** once the old TTL has expired. Links
   people already have use that same name.
5. **Close the old public port** once the lowered TTL has expired. Leave the old
   instance on the private network so Traefik can still open old links. Until
   that port is closed, a client that still has the old address creates shares
   on the old database.

After step 5, new shares are saved on the new instance. An old link is opened
like this: the new instance says it is not there, Traefik asks the old instance,
and the old instance uses one view.

## Check that it worked

Use HTTP for this. The checks below do not use up a view. Each test share
expires in one hour.

Run everything in one terminal, from a machine that can reach both instances.
Use the same private addresses as in the Traefik config, so `$OLD_ID` and
`$NEW_ID` stay set.

Create one share on the old instance, and one through the public site:

```sh
# Stored only on the old instance.
OLD_ID=$(curl -fsS -X POST "http://passed-old:3000/api/password" \
  -H "content-type: application/json" \
  -d '{"password":"YQ==","expires-in":3600,"view":1}' | tr -d '"')

# Stored only on the new instance.
NEW_ID=$(curl -fsS -X POST "https://passed.example/api/password" \
  -H "content-type: application/json" \
  -d '{"password":"YQ==","expires-in":3600,"view":1}' | tr -d '"')
```

Ask each instance where those two shares are. `204` means it has the link. `404`
means it does not.

```sh
printf 'new has new: '; curl -sS -o /dev/null -w "%{http_code}\n" -X HEAD \
  "http://passed-new:3000/api/password/$NEW_ID"
printf 'new has old: '; curl -sS -o /dev/null -w "%{http_code}\n" -X HEAD \
  "http://passed-new:3000/api/password/$OLD_ID"
printf 'old has old: '; curl -sS -o /dev/null -w "%{http_code}\n" -X HEAD \
  "http://passed-old:3000/api/password/$OLD_ID"
printf 'old has new: '; curl -sS -o /dev/null -w "%{http_code}\n" -X HEAD \
  "http://passed-old:3000/api/password/$NEW_ID"
```

```text
new has new: 204
new has old: 404
old has old: 204
old has new: 404
```

Then ask the public site. Both answers should be `204` and should include
`X-Remaining-Views` and `X-Expires-In`.

The old id shows that Traefik asked the old instance after the new one said it
was not there. The new id shows that Traefik stopped at the new instance. A
`404` for the new id, when `new has new` above was `204`, means opens are not
reaching the new instance.

```sh
echo 'public old link'
curl -sS -D - -o /dev/null -X HEAD \
  "https://passed.example/api/password/$OLD_ID" \
  | grep -i -E 'HTTP/|x-remaining-views|x-expires-in'

echo 'public new link'
curl -sS -D - -o /dev/null -X HEAD \
  "https://passed.example/api/password/$NEW_ID" \
  | grep -i -E 'HTTP/|x-remaining-views|x-expires-in'
```

## Turn off the old instance

Turn it off when it has no shares left.

A share lasts at most 14 days, and the old database gets no new shares after
step 5. Waiting 14 days from that step is enough. To turn it off sooner, this
scan must print nothing:

```sh
redis-cli -u "$OLD_REDIS_URL" --scan --pattern 'passed:????????????????????????'
```

An empty result means no shares are left. `passed:index` may still exist. That
is fine.

On Upstash, set `OLD_REDIS_URL` to the Redis URL from the database page
(`rediss://default:<token>@<endpoint>:6379`) and run the same command. That URL
speaks the Redis protocol, so `SCAN` works. The REST URL does not. The console
search box does not use this pattern either, and a search for the question marks
can look empty while share keys remain.

Then delete the `passed-read` route from `passed.yml`, reload Traefik, and stop
the old PassED process and its database. The website, creating a share, and
opening a link all stay on the new instance.

## Go back

Creating a share stays on the new instance for the whole move.

To keep the new website and read the old database first, swap the open-link
order in `passed-read`: set `service: passed-old` and `fallback: passed-new`. A
share saved on the new instance is missing on the old one, so Traefik asks the
new one.

To send every request back to the old instance, publish it on the public address
again, then point the public name at it. Do that only when the new database has
no share keys. Otherwise links created after the switch stop working.
