import base64
import copy
import json
import uuid
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'Documentación'
previous = root / 'Iteración 2'
output = root / 'Iteración 3'
output.mkdir(exist_ok=True)

def uid():
    return base64.b64encode(uuid.uuid4().bytes).decode()

def ref(item):
    return {'$ref': item['_id']}

def node(kind, parent=None, **fields):
    item = {'_type': kind, '_id': uid(), **fields}
    if parent:
        item['_parent'] = ref(parent)
    return item

def read(name):
    return json.loads((previous / name).read_text(encoding='utf-8-sig'))

def save(name, project):
    (output / name).write_text(json.dumps(project, ensure_ascii=False, indent=2), encoding='utf-8')

def clone_view(template, diagram, model, **fields):
    view = copy.deepcopy(template)
    old_view = view['_id']
    view.update(_id=uid(), _parent=ref(diagram), model=ref(model), **fields)
    association_ends = {}
    def rewrite(part, parent):
        part['_id'] = uid()
        part['_parent'] = ref(parent)
        for key, value in part.items():
            if key == 'model':
                target = model
                if model['_type'] == 'UMLAssociation' and value['$ref'] != template['model']['$ref']:
                    target = association_ends.setdefault(
                        value['$ref'], model['end1' if not association_ends else 'end2']
                    )
                part[key] = ref(target)
            elif isinstance(value, dict) and value.get('$ref') == old_view:
                part[key] = ref(view)
        for child in part.get('subViews', []):
            rewrite(child, part)
    for part in view.get('subViews', []):
        rewrite(part, view)
    # Compartments and labels refer to sibling subviews by ID.
    def pair(a, b):
        yield a['_id'], b['_id']
        for x, y in zip(a.get('subViews', []), b.get('subViews', [])):
            yield from pair(x, y)
    mapping = dict(pair(template, view))
    def update(obj):
        if isinstance(obj, dict):
            if obj.get('$ref') in mapping:
                obj['$ref'] = mapping[obj['$ref']]
            for child in obj.values():
                update(child)
        elif isinstance(obj, list):
            for child in obj:
                update(child)
    update(view)
    return view

def center(view):
    return (view['left'] + view['width']//2, view['top'] + view['height']//2)

def connect(diagram, parent, template, source, target, kind):
    model = node(kind, parent)
    if kind == 'UMLAssociation':
        model['end1'] = node('UMLAssociationEnd', model, reference=source['model'])
        model['end2'] = node('UMLAssociationEnd', model, reference=target['model'])
    else:
        model.update(source=source['model'], target=target['model'])
    parent.setdefault('ownedElements', []).append(model)
    points = ';'.join(f'{x}:{y}' for x, y in (center(source), center(target)))
    diagram['ownedViews'].append(clone_view(template, diagram, model, tail=ref(source), head=ref(target), points=points))

project = read('DiagramaCasosUsoIteracion2.mdj')
project['name'] = 'Autos Antioquia · Casos de uso de pagos'
model = project['ownedElements'][1]
model['name'] = 'Gestión de pagos'
diagram = model['ownedElements'][0]
diagram.update(name='I3 · Gestión de pagos', defaultDiagram=True)
templates = {view['_type']:view for view in diagram['ownedViews']}
model['ownedElements'] = [diagram]
diagram['ownedViews'] = []
def use_item(kind, name, x, y, w, h):
    item = node(kind, model, name=name)
    model['ownedElements'].append(item)
    view = clone_view(templates[kind + 'View'], diagram, item, left=x, top=y, width=w, height=h)
    diagram['ownedViews'].append(view)
    return view

admin = use_item('UMLActor', 'Administrador', 38, 185, 105, 96)
epayco = use_item('UMLActor', 'ePayco sandbox', 690, 180, 115, 96)
crear = use_item('UMLUseCase', 'Iniciar pago de prueba', 255, 52, 232, 58)
ver = use_item('UMLUseCase', 'Consultar historial', 255, 142, 232, 58)
sim = use_item('UMLUseCase', 'Simular resultado local', 255, 232, 232, 58)
recibir = use_item('UMLUseCase', 'Confirmar pago ePayco', 255, 322, 232, 58)
aplicar = use_item('UMLUseCase', 'Registrar resultado y renovar si se aprueba', 250, 436, 310, 66)
for a,b in [(admin,crear),(admin,ver),(admin,sim),(epayco,crear),(epayco,recibir)]:
    connect(diagram, model, templates['UMLAssociationView'], a,b,'UMLAssociation')
for a in (sim,recibir):
    connect(diagram, model, templates['UMLIncludeView'], a,aplicar,'UMLInclude')
save('CasosUsoGestionPagos.mdj', project)

project = read('DiagramaComponentesIteraciones1y2.mdj')
project['name'] = 'Autos Antioquia · Componentes I1–I3'
model = project['ownedElements'][1]
diagram = model['ownedElements'][0]
diagram['name'] = 'Componentes · Iteraciones 1 a 3'
template = next(v for v in diagram['ownedViews'] if v['_type']=='UMLComponentView')
link = next(v for v in diagram['ownedViews'] if v['_type']=='UMLDependencyView')
existing = {v['model']['$ref']:v for v in diagram['ownedViews'] if v['_type']=='UMLComponentView'}
by_name = {e['name']:existing[e['_id']] for e in model['ownedElements'] if e['_type']=='UMLComponent'}
def component(name, x, y):
    item = node('UMLComponent', model, name=name)
    model['ownedElements'].append(item)
    view = clone_view(template, diagram, item, left=x, top=y, width=200, height=60)
    diagram['ownedViews'].append(view)
    return view
payments = component('Rutas de pagos y webhook', 310, 350)
service = component('Servicio de pagos', 550, 350)
gateway = component('ePayco Smart Checkout / Apify', 310, 475)
for a,b in [(by_name['Rutas Express'], payments),(payments, service),(payments,gateway),
            (gateway,payments),(service,by_name['PostgreSQL mediante pg.Pool'])]:
    connect(diagram, model, link, a,b,'UMLDependency')
save('ComponentesIteraciones1a3.mdj', project)

# Las secuencias editables y su vista de conjunto se mantienen como entregables en StarUML y SVG.

from html import escape

def svg(name, width, height, parts):
    marker = '<defs><marker id="a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#435768"/></marker></defs>'
    (output / name).write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" font-family="Arial" font-size="15">'
        + marker + '<rect width="100%" height="100%" fill="#f8fbfc"/>' + ''.join(parts) + '</svg>',
        encoding='utf-8',
    )

def label(x, y, value, size=15):
    return f'<text x="{x}" y="{y}" text-anchor="middle" fill="#183342" font-size="{size}">{escape(value)}</text>'

def box(x,y,w,h):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" fill="#e3f2f0" stroke="#147475"/>'

def arrow(x,y,x2,y2, directed=True):
    marker = ' marker-end="url(#a)"' if directed else ''
    return f'<line x1="{x}" y1="{y}" x2="{x2}" y2="{y2}" stroke="#435768" stroke-width="1.6"{marker}/>'

parts = [box(210,25,410,438), label(415,49,'Autos Antioquia · Módulo de pagos')]
use_labels = ['Iniciar pago de prueba','Consultar historial','Simular resultado local',
              'Confirmar pago ePayco','Registrar resultado y renovar si se aprueba']
ys = [94,166,238,310,415]
parts += [arrow(167,184,278,y,False) for y in ys[:3]]
parts += [arrow(665,210,552,y,False) for y in (94,310)]
parts += [f'<path d="M{start} {y+23} V{end} H{endx} V390" fill="none" stroke="#435768" stroke-dasharray="5 4" marker-end="url(#a)"/>'
          for start,y,end,endx in [(300,238,368,355),(490,310,370,490)]]
parts += [label(325,360,'«include»',12),label(524,368,'«include»',12)]
for y, name in zip(ys,use_labels):
    parts += [f'<ellipse cx="415" cy="{y}" rx="{160 if y == 415 else 138}" ry="25" fill="white" stroke="#147475"/>', label(415,y+5,name)]
for x,y,name in [(110,170,'Administrador'),(719,196,'ePayco sandbox')]:
    parts += [f'<circle cx="{x}" cy="{y-30}" r="10" fill="white" stroke="#435768"/><path d="M{x} {y-20}v29 m-17 -15h34 m-17 15l-15 19 m15 -19l15 19" fill="none" stroke="#435768"/>',
              label(x,y+50,name)]
svg('CasosUsoGestionPagos.svg',830,475,parts)

parts = []
positions = {
 'Interfaz web':(28,45),'Rutas Express':(290,45),'Middleware de sesión y rol':(565,45),
 'Controladores de acceso y gestión':(28,156),'Servicios de acceso y gestión':(28,263),
 'Rutas de pagos y webhook':(290,156),'Servicio de pagos':(290,263),
 'ePayco Smart Checkout / Apify':(565,156),'PostgreSQL mediante pg.Pool':(175,375),
}
for a,b in [('Interfaz web','Rutas Express'),('Rutas Express','Middleware de sesión y rol'),
            ('Rutas Express','Controladores de acceso y gestión'),('Rutas Express','Rutas de pagos y webhook'),
            ('Controladores de acceso y gestión','Servicios de acceso y gestión'),
            ('Rutas de pagos y webhook','Servicio de pagos'),('Rutas de pagos y webhook','ePayco Smart Checkout / Apify'),
            ('Servicios de acceso y gestión','PostgreSQL mediante pg.Pool'),('Servicio de pagos','PostgreSQL mediante pg.Pool')]:
    x,y=positions[a]; x2,y2=positions[b]
    if y == y2:
        parts.append(arrow(x+228,y+24,x2,y2+24))
    else:
        parts.append(arrow(x+114,y+48,x2+114,y2))
for name,(x,y) in positions.items():
    parts += [box(x,y,228,48),label(x+114,y+29,name,13)]
svg('ComponentesIteraciones1a3.svg',820,450,parts)
