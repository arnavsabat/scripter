// The flat block schema (SPEC 4.1, D-013): one `block` node whose `type` attribute holds the
// element type. A Yjs element's name can never change, so storing the type as the node type
// would make every type change delete and recreate the line (and lose a co-writer's typing).
import { Schema, type Node } from 'prosemirror-model';
import { isElementType, type ElementType } from './elements';

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    block: {
      content: 'text*',
      // Plain text only: screenplay elements carry no inline formatting in v1.
      marks: '',
      attrs: {
        id: { default: null },
        type: { default: 'action' },
        sceneId: { default: null },
      },
      toDOM: (node) => [
        'p',
        {
          class: 'el',
          'data-type': String(node.attrs.type),
          'data-id': String(node.attrs.id ?? ''),
        },
        0,
      ],
      parseDOM: [
        {
          tag: 'p',
          getAttrs: (dom) => {
            const type = (dom as { getAttribute(name: string): string | null }).getAttribute(
              'data-type',
            );
            return { type: isElementType(type) ? type : 'action' };
          },
        },
      ],
    },
    text: {},
  },
});

export const blockType = schema.nodes.block;

export const typeOf = (node: Node): ElementType => {
  const t: unknown = node.attrs.type;
  return isElementType(t) ? t : 'action';
};

export interface BlockSpec {
  type: ElementType;
  text?: string;
  id?: string;
  sceneId?: string;
}

/** Attributes for a block of `type`. Only scene headings carry a scene ID. */
export function blockAttrs(type: ElementType, id: string, sceneId: string | null) {
  return { id, type, sceneId: type === 'scene_heading' ? sceneId : null };
}
