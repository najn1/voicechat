import ssl
import json
import uuid
from aiohttp import web, WSMsgType

ROOMS = {}

routes = web.RouteTableDef()

@routes.get('/')
async def index(req):
    return web.FileResponse('index.html')

@routes.get('/client.js')
async def client_js(req):
    return web.FileResponse('client.js')

@routes.get('/ws')
async def websocket_handler(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)

    peer_id = uuid.uuid4().hex
    room = None
    display_name = None
    try:
        async for msg in ws:
            if msg.type == WSMsgType.TEXT:
                data = json.loads(msg.data)
                t = data.get('type')
                if t == 'join':
                    room = data.get('room', 'default')
                    display_name = data.get('name', peer_id[:6])
                    if room not in ROOMS:
                        ROOMS[room] = {}
                    await ws.send_json({"type": "id", "id": peer_id})
                    peers = [{"id": pid, "name": info["name"]} for pid, info in ROOMS[room].items()]
                    await ws.send_json({"type": "peers", "peers": peers})
                    for pid, info in ROOMS[room].items():
                        try:
                            await info["ws"].send_json({"type": "new-peer", "id": peer_id, "name": display_name})
                        except:
                            pass
                    ROOMS[room][peer_id] = {"ws": ws, "name": display_name}
                elif t in ('offer', 'answer', 'candidate'):
                    to = data.get('to')
                    if not (room and to and room in ROOMS and to in ROOMS[room]):
                        continue
                    try:
                        await ROOMS[room][to]['ws'].send_json(data)
                    except:
                        pass
            elif msg.type == WSMsgType.ERROR:
                print('ws error:', ws.exception())
    finally:
        if room and room in ROOMS and peer_id in ROOMS[room]:
            del ROOMS[room][peer_id]
            for pid, info in ROOMS[room].items():
                try:
                    await info['ws'].send_json({"type": "peer-left", "id": peer_id})
                except:
                    pass
            if not ROOMS[room]:
                del ROOMS[room]
    return ws

app = web.Application()
app.add_routes(routes)

if __name__ == '__main__':
    import os
    port = int(os.environ.get('PORT', 10000))  # Render сам даст порт
    web.run_app(app, host='0.0.0.0', port=port)
