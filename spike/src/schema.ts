// Flat block schema (SPEC 4.1) in two variants, so the spike can compare them:
//
// - "nodeTypes": each element type is its own ProseMirror node type (scene_heading, action, ...).
//   In y-prosemirror a node type becomes the Yjs XmlElement's nodeName, which can never change,
//   so changing an element's type means deleting the element and creating a new one.
// - "typeAttr": one node type, "block", with the element type stored in an attribute.
//   Yjs attributes can be changed in place, so a type change never recreates the element.
//
// Both variants are permissive: any block may follow any other (doc content is just block+).
import { Schema, type Node, type NodeType } from 'prosemirror-model';

export const ELEMENT_TYPES = [
  'scene_heading',
  'action',
  'character',
  'parenthetical',
  'dialogue',
  'transition',
  'shot',
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export type Variant = 'nodeTypes' | 'typeAttr';

export interface BlockSpec {
  type: ElementType;
  text: string;
  id?: string;
  sceneId?: string;
}

export interface SchemaKit {
  variant: Variant;
  schema: Schema;
  /** Element type of a block node. */
  typeOf(node: Node): ElementType;
  /** Node type and attrs for a new block of the given element type. */
  blockType(
    type: ElementType,
    attrs: { id: string; sceneId: string | null },
  ): {
    type: NodeType;
    attrs: Record<string, unknown>;
  };
  /** Builds a block node. */
  block(spec: BlockSpec): Node;
  /** Every node name a block can have in Yjs (used for the undo manager's protected nodes). */
  blockNodeNames: string[];
}

let counter = 0;
/** Random block or scene ID. The real build will use a proper ID scheme. */
export const newId = (prefix = 'b') =>
  `${prefix}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const domFor = (type: ElementType, node: Node) =>
  [
    'p',
    {
      class: `el el-${type}`,
      'data-type': type,
      'data-id': String(node.attrs.id ?? ''),
    },
    0,
  ] as const;

function nodeTypesKit(): SchemaKit {
  const nodes: Record<string, object> = {
    doc: { content: 'block+' },
    text: { group: 'inline' },
  };
  for (const type of ELEMENT_TYPES) {
    nodes[type] = {
      group: 'block',
      content: 'text*',
      attrs:
        type === 'scene_heading'
          ? { id: { default: null }, sceneId: { default: null } }
          : { id: { default: null } },
      toDOM: (node: Node) => domFor(type, node),
      parseDOM: [{ tag: `p.el-${type}` }],
    };
  }
  const schema = new Schema({ nodes });
  return {
    variant: 'nodeTypes',
    schema,
    typeOf: (node) => node.type.name as ElementType,
    blockType: (type, attrs) => ({
      type: schema.nodes[type]!,
      attrs: type === 'scene_heading' ? attrs : { id: attrs.id },
    }),
    block({ type, text, id, sceneId }) {
      const attrs =
        type === 'scene_heading'
          ? { id: id ?? newId(), sceneId: sceneId ?? newId('s') }
          : { id: id ?? newId() };
      return schema.nodes[type]!.create(attrs, text ? schema.text(text) : null);
    },
    blockNodeNames: [...ELEMENT_TYPES],
  };
}

function typeAttrKit(): SchemaKit {
  const schema = new Schema({
    nodes: {
      doc: { content: 'block+' },
      text: { group: 'inline' },
      block: {
        group: 'block',
        content: 'text*',
        attrs: {
          id: { default: null },
          type: { default: 'action' },
          sceneId: { default: null },
        },
        toDOM: (node: Node) => domFor(node.attrs.type as ElementType, node),
        parseDOM: [{ tag: 'p.el' }],
      },
    },
  });
  return {
    variant: 'typeAttr',
    schema,
    typeOf: (node) => node.attrs.type as ElementType,
    blockType: (type, attrs) => ({
      type: schema.nodes.block,
      attrs: { id: attrs.id, type, sceneId: type === 'scene_heading' ? attrs.sceneId : null },
    }),
    block({ type, text, id, sceneId }) {
      return schema.nodes.block.create(
        {
          id: id ?? newId(),
          type,
          sceneId: type === 'scene_heading' ? (sceneId ?? newId('s')) : null,
        },
        text ? schema.text(text) : null,
      );
    },
    blockNodeNames: ['block'],
  };
}

export const makeKit = (variant: Variant): SchemaKit =>
  variant === 'nodeTypes' ? nodeTypesKit() : typeAttrKit();
