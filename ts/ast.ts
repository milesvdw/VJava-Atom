'use babel'

import {Selection, Branch} from './ui';

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
	hidden?: boolean;
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
	currentPos: [number, number] = [0,0];

	accumulate(pos: Pos, str: string): Pos {
		const newlineMatches = str.match(/\n/g) || [];
		const newlineCount = newlineMatches.length;

		let endPos: Pos;
		const lastNewlineIndex = str.lastIndexOf("\n");
		if (lastNewlineIndex === -1) {
			endPos = [pos[0], pos[1] + str.length];
		} else {
			endPos = [pos[0] + newlineCount, str.length - lastNewlineIndex - 1];
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

		this.visitRegion(node.thenbranch);
		this.visitRegion(node.elsebranch);

		node.span = {
			start: startPos,
			end: this.currentPos
		};
	}

	visitRegion(node: RegionNode): void {
		const startPos = this.currentPos;
		if(node.hidden) {
				node.span = null;
		} else {
			super.visitRegion(node);

			node.span = {
				start: startPos,
				end: this.currentPos
			};
		}
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

		//see if this alternative should be displayed
		if(isBranchActive(node, getSelectionForNode(node, this.selections), "thenbranch")) {
			newNode.thenbranch = this.rewriteRegion(node.thenbranch);
		} else {
			newNode.thenbranch = Object.assign({}, node.thenbranch);
			newNode.thenbranch.hidden = true;
		}

		//see if this alternative should be displayed
		if(isBranchActive(node, getSelectionForNode(node, this.selections), "elsebranch")) {
			newNode.elsebranch = this.rewriteRegion(node.elsebranch);
		} else {
			newNode.elsebranch = Object.assign({}, node.elsebranch);
			newNode.elsebranch.hidden = true;
		}
		return [newNode];
	}
}

export class NodeInserter extends SyntaxRewriter {

	constructor(public newNode: SegmentNode, public location: TextBuffer.IPoint, public editor: AtomCore.IEditor) {
		super();
	}

	rewriteDocument(doc : RegionNode) {
		//walk the span before and after we do the change, because spans have semantic meaning here
		const walker = new SpanWalker();
		walker.visitRegion(doc);
		const newDoc = this.rewriteRegion(doc);
		walker.visitRegion(newDoc);
		return newDoc;
	}

	rewriteRegion(region: RegionNode) : RegionNode {
		var newSegments: SegmentNode[] = []
		for(var segment of region.segments) {
			if(spanContainsPoint(segment.span, this.location)) {
				if(segment.type === 'choice') {
					newSegments = newSegments.concat(this.rewriteChoice(segment));
				} else {
					newSegments = newSegments.concat(this.rewriteContent(segment));
				}
			} else {
				newSegments.push(segment);
			}
		}
		var newRegion : RegionNode = {segments: newSegments, type: "region", span: region.span};
		return newRegion;
	}

	rewriteContent(node: ContentNode) : SegmentNode[] {
		const firstRange : Span = {
                start: node.span.start,
                end: [this.location.row, this.location.column]
              };
		const secondRange : Span = {
                start: [this.location.row, this.location.column],
                end: node.span.end
              };

		const first : ContentNode= {
			type: "text",
			content: this.editor.getTextInBufferRange(firstRange) + '\n'
		}
		const third : ContentNode = {
			type: "text",
			content: this.editor.getTextInBufferRange(secondRange)
		}
		return [first, this.newNode, third];
	}

}

export class EditPreserver extends SyntaxWalker {
	constructor(public editor: AtomCore.IEditor, public selections: Selection[]) {
		super();
	}

	visitContent(node: ContentNode): void {
		node.content = this.editor.getTextInBufferRange(node.marker.getBufferRange());
	}

	visitChoice(node: ChoiceNode): void {
		var selection = getSelectionForNode(node, this.selections);
		if(isBranchActive(node, selection, "thenbranch") && !node.thenbranch.hidden) {
			this.visitRegion(node.thenbranch);
		}
		if(isBranchActive(node, selection, "elsebranch") && !node.elsebranch.hidden) {
			this.visitRegion(node.elsebranch);
		}
	}
}

export function getSelectionForNode(node: ChoiceNode, selections: Selection[]) : Selection {
	return getSelectionForDim(node.name, selections);
}

export function getSelectionForDim(dimName: string, selections: Selection[]): Selection {
	for(var sel of selections) {
		if(sel.name === dimName) return sel;
	}
	return {name: dimName, thenbranch: true, elsebranch: true};
}

export function isBranchActive(node, selection: Selection, branch: Branch) {
	if(selection) {
		return selection.thenbranch && branch === "thenbranch" && node.kind === "positive"
					|| selection.thenbranch && branch === "elsebranch" && node.kind === "contrapositive"
					|| selection.elsebranch && branch === "elsebranch" && node.kind === "positive"
					|| selection.elsebranch && branch === "thenbranch" && node.kind === "contrapositive"
	} else return false;
}


export class DimensionDeleter extends SyntaxRewriter {
	constructor(public selection: Selection) {
		super();
	}

	rewriteChoice(node: ChoiceNode) : SegmentNode[] {
		if(node.name != this.selection.name) return [node]; // make no changes unless this is the dimension being deleted
		var newNodes = [];
		if(isBranchActive(node, this.selection, "thenbranch")) {
			for(var oldNode of node.thenbranch.segments) {
				newNodes.push(... this.rewriteNode(oldNode));
			}
		}
		if(isBranchActive(node, this.selection, "elsebranch")) {
			for(var oldNode of node.thenbranch.segments) {
				newNodes.push(... this.rewriteNode(oldNode));
			}
		}

		return newNodes;
	}

	rewriteNode(node: SegmentNode) : SegmentNode[] {
		if(node.type === 'choice') return this.rewriteChoice(node);
		else return this.rewriteContent(node);
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

function spanContainsPoint(outer: Span, inner: TextBuffer.IPoint) : boolean {
	return (
		((outer.start[0] === inner.row && outer.start[1] < inner.column) // exclusive at the beginning, inclusive at the end
	  ||
		(outer.start[0] < inner.row)) // if the outer span starts before the second Span
		&&
		((outer.end[0] > inner.row)
		||
		(outer.end[1] > inner.column && outer[1] === inner.column))
	)
}

export function renderDocument(region: RegionNode) : string {
	return region.segments.reduce(renderContents, '');
}

function renderContents(acc: string, node: SegmentNode) : string {
	if (node.type === 'choice') {
		if(!node.thenbranch.hidden) acc = acc + renderDocument(node.thenbranch);
		if(!node.elsebranch.hidden) acc = acc + renderDocument(node.elsebranch);
		return acc;
	}
	else {
		return acc + node.content;
	}
}

export function docToPlainText(region: RegionNode) : string {
	return region.segments.reduce(nodeToPlainText, '');
}

export function nodeToPlainText(acc: string, node: SegmentNode) : string {
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
