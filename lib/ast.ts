
type Pos = [number, number]; // row, column
interface Span {
	start: Pos;
	end: Pos;
}

interface ContentNode {
	type: "text";
	content: string;
	span?: Span;
	marker?: AtomCore.IDisplayBufferMarker;
}

// TODO: consider putting more concrete syntax stuff in here so that it's easy
// to reconstruct concrete syntax without leaking assumptions all over the place
interface ChoiceNode {
	type: "choice";
	dimension: string;
	color?: string;
	left: RegionNode;
	right: RegionNode;
	span?: Span;
	marker?: AtomCore.IDisplayBufferMarker;
}

// This is probably what the parser should return at the top level.
interface RegionNode {
	type: "region";
	segments: SegmentNode[];
	span?: Span;
}

type SegmentNode = ContentNode | ChoiceNode;

/**
 * Override visit methods to visit nodes of that type on the tree.
 * Call the base method in your override to continue traversal through a node's children.
 */
abstract class SyntaxWalker {
	visitContent(node: ContentNode): void { }

	visitChoice(node: ChoiceNode): void {
		this.visitRegion(node.left);
		this.visitRegion(node.right);
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
class SpanWalker extends SyntaxWalker {
	currentPos: [number, number] = [1,1]; // atom positions start at [1,1], right?

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
		this.visitRegion(node.left);

		// assumption to test if the #else syntax exists
		if (node.right.segments.length !== 0) {
			this.currentPos = this.accumulate(this.currentPos, "\n"); // #else
			this.visitRegion(node.right);
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
		const newLeft = this.rewriteRegion(node.left);
		const newRight = this.rewriteRegion(node.right);
		const newNode: ChoiceNode = {
			type: "choice",
			dimension: node.dimension,
			left: newLeft,
			right: newRight
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
				dimension: "test",
				left: {
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
				right: {
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
