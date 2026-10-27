# Regenerate with: python3 apps/web/test/fixtures/make_fixtures.py (from the repo root).
# Generates the "Night Shift" import fixtures: the same screenplay as Fountain and as Final Draft,
# each with its format's unsupported extras, plus the expected blocks as JSON.
import json, random
from xml.sax.saxutils import escape
random.seed(7)
places = ['DINER', 'PARKING LOT', 'MAYA\'S CAR', 'POLICE STATION - LOBBY', 'PIER', 'MOTEL ROOM', 'ROOFTOP', 'GAS STATION']
times = ['NIGHT', 'LATER', 'CONTINUOUS', 'DAWN']
actions = [
  'Rain hammers the windows. A neon sign buzzes, dies, buzzes again.',
  'Maya slides into the booth across from him. She doesn\'t take off her coat.',
  'John stares at the coffee like it owes him money.',
  'A siren somewhere far off. Neither of them looks up.',
  'She pushes a folded envelope across the table. He doesn\'t touch it.',
  'The waitress drifts past, refills nothing, and keeps going.',
  'Headlights sweep the room. For a second they\'re both lit up like suspects.',
  'He finally opens the envelope. Inside: a photograph, a key, and a ticket stub from the pier.',
  'She checks her phone. Three missed calls. All the same number.',
  'Outside, a car door slams. Then another.',
]
lines = [
  'You said you\'d be here at ten.',
  'I said I\'d try. That\'s not the same thing.',
  'It is tonight.',
  'Who else knows?',
  'Nobody. Not yet. But that won\'t last, and you know it won\'t.',
  'Then we don\'t have long. Finish your coffee.',
  'I told you not to come back here. Not tonight. Not after what happened at the pier. You never listen.',
  'Sit down. Eat something. We have to talk about the money, and about your brother.',
  'He\'s not my brother anymore.',
  'Tell that to the people looking for him.',
]
parens = ['(quietly)', '(not looking up)', '(beat)', '(re: the envelope)']
script = []  # (type, text)
for s in range(36):
    if s in (0, 18):
        script.append(('act', 'ACT ONE' if s == 0 else 'ACT TWO'))
    script.append(('scene_heading', f"{'INT' if s % 3 else 'EXT'}. {places[s % len(places)]} - {times[s % len(times)]}"))
    for b in range(random.randint(2, 6)):
        if random.random() < 0.45:
            script.append(('action', ' '.join(random.sample(actions, random.randint(1, 3)))))
        else:
            script.append(('character', random.choice(['MAYA', 'JOHN', 'JOHN (V.O.)', 'DETECTIVE REYES'])))
            if random.random() < 0.3: script.append(('parenthetical', random.choice(parens)))
            script.append(('dialogue', ' '.join(random.sample(lines, random.randint(1, 3)))))
    if s % 5 == 4: script.append(('transition', 'CUT TO:'))
    if s == 7: script.append(('shot', 'ANGLE ON THE ENVELOPE'))
    if s == 11: script.append(('centered', 'THE END OF THE BEGINNING'))
    if s == 13: script.append(('lyrics', 'Drive all night, drive all night'))
    if s == 20: script.append(('dual', ('MAYA', 'We go now.', 'JOHN', 'We wait.')))

# Where the extras go: bold on the first action from index 5, a note on the first from index 9.
BOLD = next(i for i, (t, _) in enumerate(script) if t == 'action' and i >= 5)
NOTE = next(i for i, (t, _) in enumerate(script) if t == 'action' and i >= 9 and i != BOLD)

# Expected blocks (the same from either file).
expected = []
for t, x in script:
    if t in ('act', 'centered', 'lyrics'): expected.append({'type': 'action', 'text': x})
    elif t == 'dual':
        a, ad, b, bd = x
        expected += [{'type': 'character', 'text': a}, {'type': 'dialogue', 'text': ad}, {'type': 'character', 'text': b}, {'type': 'dialogue', 'text': bd}]
    else: expected.append({'type': t, 'text': x})

# ---- Fountain ----
f = ['Title: _**Night Shift**_', 'Credit: Written by', 'Author: Sam Rivera', 'Draft date: October 27, 2026', 'Contact:', '    sam@example.com', '', '']
f += ['# Act One', '', '= Maya comes back to the diner.', '']
for i, (t, x) in enumerate(script):
    if t == 'scene_heading':
        f += [x + (' #%d#' % i if i < 20 else ''), '']
    elif t == 'action':
        if i == BOLD:
            w = x.split(' ')
            x = '**' + w[0] + '** ' + ' '.join(w[1:])
        if i == NOTE: x = '[[Make the diner feel colder.]]' + x
        f += [x, '']
    elif t == 'character':
        f += [x]
    elif t == 'parenthetical':
        f += [x]
    elif t == 'dialogue':
        f += [x, '']
    elif t == 'transition':
        f += [x, '']
    elif t == 'shot':
        f += [x, '']  # Fountain has no Shot: an uppercase action line
    elif t == 'act':
        f += ['>' + x + '<', '']
    elif t == 'centered':
        f += ['>' + x + '<', '']
    elif t == 'lyrics':
        f += ['~' + x, '']
    elif t == 'dual':
        a, ad, b, bd = x
        f += [a, ad, '', b + ' ^', bd, '']
    if i == 40: f += ['===', '']
    if i == 60: f += ['/* An abandoned version of this scene.', 'JOHN', 'I never wanted this. */', '']
open('apps/web/test/fixtures/night-shift.fountain', 'w').write('\n'.join(f))

# Fountain has no Shot element: it comes in as action.
fexp = [dict(e) for e in expected]
for e in fexp:
    if e['type'] == 'shot': e['type'] = 'action'

# ---- Final Draft ----
def para(kind, text, attrs='', style=''):
    st = f' Style="{style}"' if style else ''
    return f'    <Paragraph Type="{kind}"{attrs}>\n      <Text{st}>{escape(text)}</Text>\n    </Paragraph>'
x = ['<?xml version="1.0" encoding="UTF-8" standalone="no" ?>', '<FinalDraft DocumentType="Script" Template="No" Version="5">', '  <Content>']
kinds = {'scene_heading': 'Scene Heading', 'action': 'Action', 'character': 'Character', 'parenthetical': 'Parenthetical', 'dialogue': 'Dialogue', 'transition': 'Transition', 'shot': 'Shot'}
for i, (t, v) in enumerate(script):
    if t == 'act': x.append(para('New Act', v))
    elif t == 'centered': x.append(para('General', v))
    elif t == 'lyrics': x.append(para('Lyrics', v))
    elif t == 'dual':
        a, ad, b, bd = v
        x.append('    <Paragraph Type="Character">\n      <DualDialogue>\n' + '\n'.join(['  ' + para('Character', a), '  ' + para('Dialogue', ad), '  ' + para('Character', b), '  ' + para('Dialogue', bd)]) + '\n      </DualDialogue>\n    </Paragraph>')
    elif t == 'scene_heading':
        x.append(para(kinds[t], v, f' Number="{i}"' if i < 20 else ''))
    elif t == 'action' and i == BOLD:
        x.append(f'    <Paragraph Type="Action">\n      <Text Style="Bold">{escape(v.split(" ")[0])}</Text>\n      <Text>{escape(" " + " ".join(v.split(" ")[1:]))}</Text>\n    </Paragraph>')
    elif t == 'action' and i == NOTE:
        x.append(f'    <Paragraph Type="Action">\n      <ScriptNote ID="1"><Paragraph><Text>Make the diner feel colder.</Text></Paragraph></ScriptNote>\n      <Text>{escape(v)}</Text>\n    </Paragraph>')
    else: x.append(para(kinds[t], v))
x.append('    <Paragraph Type="Action">\n      <Text></Text>\n    </Paragraph>')
x += ['  </Content>', '  <TitlePage>', '    <Content>']
for line in ['Night Shift', '', 'Written by', 'Sam Rivera', 'sam@example.com']:
    x.append(f'      <Paragraph Alignment="Center">\n        <Text>{escape(line)}</Text>\n      </Paragraph>')
x += ['    </Content>', '  </TitlePage>', '</FinalDraft>']
open('apps/web/test/fixtures/night-shift.fdx', 'w').write('\n'.join(x) + '\n')
json.dump({'fdx': expected, 'fountain': fexp}, open('apps/web/test/fixtures/night-shift.expected.json', 'w'), indent=1)
print(len(script), 'elements;', sum(1 for t,_ in script if t=='scene_heading'), 'scenes')
