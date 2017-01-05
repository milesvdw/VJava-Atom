'use babel'

import {Selection} from './ui';

type Pos = [number, number]; // row, column

export interface Span {
	start: Pos;
	end: Pos;
}

export interface ContentNode {
	type: "text";
	content: string;
	span?: Span;
	marker?: AtomCore.IDisplayBufferMarker;
}

type ChoiceKind = "positive" | "contrapositive";

// TODO: consider putting more concrete syntax stuff in here so that it's easy
// to reconstruct concrete syntax without leaking assumptions all over the place
export interface ChoiceNode {
	type: "choice";
	name: string;
	color?: string;
	thenbranch: RegionNode;
	elsebranch: RegionNode;
	kind?: ChoiceKind;
	span?: Span;
	marker?: AtomCore.IDisplayBufferMarker;
}

// This is probably what the parser should return at the top level.
export interface RegionNode {
	type: "region";
	segments: SegmentNode[];
	span?: Span;
}

export type SegmentNode = ContentNode | ChoiceNode;

/**
 * Override visit methods to visit nodes of that type on the tree.
 * Call the base method in your override to continue traversal through a node's children.
 */
export abstract class SyntaxWalker {
	visitContent(node: ContentNode): void { }

	visitChoice(node: ChoiceNode): void {
		this.visitRegion(node.thenbranch);
		this.visitRegion(node.elsebranch);
	}

	visitRegion(region: RegionNode): void {
		for (const node of region.segments) {
			switch (node.type) {
			case "text":
				this.visitContent(node);
				break;
			case "choice":
				this.visitChoice(node);
				break;
			}
		}
	}
}

/**
 * Overwrites spans in-place in a document.
 */
export class SpanWalker extends SyntaxWalker {
	currentPos: [number, number] = [0,0]; // atom positions start at [1,1], elsebranch?

	accumulate(pos: Pos, str: string): Pos {
		const newlineMatches = str.match(/\n/g) || [];
		const newlineCount = newlineMatches.length;

		let endPos: Pos;
		const lastNewlineIndex = str.lastIndexOf("\n");
		if (lastNewlineIndex === -1) {
			endPos = [pos[0], pos[1] + str.length];
		} else {
			endPos = [pos[0] + newlineCount, str.length - lastNewlineIndex];
		}

		return endPos;
	}

	visitContent(node: ContentNode): void {
		const endPos = this.accumulate(this.currentPos, node.content);

		node.span = {
			start: this.currentPos,
			end: endPos
		};

		this.currentPos = endPos;
	}

	visitChoice(node: ChoiceNode): void {
		const startPos = this.currentPos;

		// assume that choice syntax consumes a line (yay assumptions!)
		this.currentPos = this.accumulate(startPos, "\n"); // #ifdef
		this.visitRegion(node.thenbranch);

		// assumption to test if the #else syntax exists
		if (node.elsebranch.segments.length !== 0) {
			this.currentPos = this.accumulate(this.currentPos, "\n"); // #else
			this.visitRegion(node.elsebranch);
		}
		this.currentPos = this.accumulate(this.currentPos, "\n"); // #endif

		node.span = {
			start: startPos,
			end: this.currentPos
		};
	}

	visitRegion(node: RegionNode): void {
		const startPos = this.currentPos;
		super.visitRegion(node);

		node.span = {
			start: startPos,
			end: this.currentPos
		};
	}
}

/**
 * Override rewrite methods to replace nodes in a document.
 */
abstract class SyntaxRewriter {
	constructor() {}
	/**
	 * Don't override this.
	 */
	rewriteDocument(document: RegionNode): RegionNode {
		const newDoc = this.rewriteRegion(document);
		const walker = new SpanWalker();
		walker.visitRegion(newDoc);
		return newDoc;
	}

	rewriteContent(node: ContentNode): SegmentNode[] {
		return [node];
	}

	rewriteChoice(node: ChoiceNode): SegmentNode[] {
		const newthenbranch = this.rewriteRegion(node.thenbranch);
		const newelsebranch = this.rewriteRegion(node.elsebranch);
		const newNode: ChoiceNode = {
			type: "choice",
			name: node.name,
			thenbranch: newthenbranch,
			elsebranch: newelsebranch
		};
		return [newNode];
	}

	rewriteRegion(doc: RegionNode): RegionNode {
		const rewrittenNodes: SegmentNode[] = [];
		for (const node of doc.segments) {
			switch (node.type) {
			case "text":
				const newContent = this.rewriteContent(node);
				rewrittenNodes.push(...newContent);
				break;
			case "choice":
				const newChoice = this.rewriteChoice(node);
				rewrittenNodes.push(...newChoice);
				break;
			}
		}

		const region: RegionNode = {
			type: "region",
			segments: rewrittenNodes
		};

		return region;
	}
}

export class ViewRewriter extends SyntaxRewriter {

	constructor(public selections: Selection[]) {
		super();
	}

	rewriteChoice(node: ChoiceNode): ChoiceNode[] {
		const newthenbranch = this.rewriteRegion(node.thenbranch);
		const newelsebranch = this.rewriteRegion(node.elsebranch);
		const newNode: ChoiceNode = {
			type: "choice",
			name: node.name,
			thenbranch: newthenbranch,
			elsebranch: newelsebranch
		};

		//found is used to see if any selections have been made - if this is a brand new dimension, default both branches to shown
		var found = false;
		var selection;
		for (var i = 0; i < this.selections.length; i ++) {
			if (this.selections[i].name === node.name) {
				found = true;
				selection = this.selections[i];
				break;
			}
		}

		//see if this alternative should be displayed
		if(!found || selection['thenbranch']) {
			newNode.thenbranch = this.rewriteRegion(node.thenbranch);
		} else {
			newNode.thenbranch = {type: "region", segments: []};
		}

		//see if this alternative should be displayed
		if(!found || selection['elsebranch']) {
			newNode.elsebranch = this.rewriteRegion(node.elsebranch);
		} else {
			newNode.elsebranch = {type: "region", segments: []};
		}
		return [newNode	];
	}
}

class SimplifierRewriter extends SyntaxRewriter {

	rewriteRegion(region: RegionNode): RegionNode {
		const newSegments: SegmentNode[] = [];
		for (const segment of region.segments) {
			if (segment.type === "text") {
				this.simplifyContent(newSegments, segment);
			} else {
				newSegments.push(...this.rewriteChoice(segment));
			}
		}

		const newRegion: RegionNode = {
			type: "region",
			segments: newSegments
		};

		return newRegion;
	}

	simplifyContent(newSegments: SegmentNode[], contentNode: ContentNode) {
		const last = newSegments[newSegments.length - 1];
		if (last && last.type === "text") {
			last.content += contentNode.content;
		} else {
			const newSegment: ContentNode = {
				type: "text",
				content: contentNode.content
			};
			newSegments.push(newSegment);
		}
	}
}

export function renderDocument(region: RegionNode) : string {
	return region.segments.reduce(renderContents, '');
}

function renderContents(acc: string, node: SegmentNode) : string {
	if (node.type === 'choice') {
		return acc + renderDocument(node.thenbranch) + renderDocument(node.elsebranch);
	}
	else {
		return acc + node.content;
	}
}

export function docToPlainText(region: RegionNode) : string {
	return region.segments.reduce(nodeToPlainText, '');
}

function nodeToPlainText(acc: string, node: SegmentNode) : string {
	if(node.type === 'choice') {
		var syntax = ''
		if(node.kind === 'positive') syntax = '#ifdef';
		else syntax = '#ifndef'
		syntax = syntax + ' ' + node.name;

		acc = acc + syntax + docToPlainText(node.thenbranch);
		if(node.elsebranch.segments.length > 0) {
			acc = acc + '#else' + docToPlainText(node.elsebranch);
		}
		acc = acc + '#endif';
		return acc;
	}
	else {
		return acc + node.content
	}
}

function test() {
	const rew = new SimplifierRewriter();
	const doc: RegionNode = {
		type: "region",
		segments: [
			{
				type: "text",
				content: "foo"
			},
			{
				type: "text",
				content: "bar\n"
			},
			{
				type: "choice",
				name: "test",
				thenbranch: {
					type: "region",
					segments: [
						{
							type: "text",
							content: "foo"
						},
						{
							type: "text",
							content: "bar\n"
						}
					]
				},
				elsebranch: {
					type: "region",
					segments: []
				}
			}
		]
	};

	const newDoc = rew.rewriteDocument(doc);
	console.log(JSON.stringify(newDoc));
}

test();
