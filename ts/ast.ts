'use babel'

import { Selector, Branch } from './ui';

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
    thenbranch: RegionNode;
    elsebranch: RegionNode;
    kind: ChoiceKind;
    span?: Span;
    marker?: AtomCore.IDisplayBufferMarker;
    delete?: boolean;
}

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
    visitDocument(doc: RegionNode): void {
      this.visitRegion(doc);
    }

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
    currentPos: [number, number] = [0, 0];

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
      //.slice(0, -1)
        const endPos = this.accumulate(this.currentPos, node.content.slice(0, -1)); //put the end marker before the final newline

        node.span = {
            start: this.currentPos,
            end: endPos
        };

        this.currentPos = endPos;
    }

    visitChoice(node: ChoiceNode): void {
        //this will have been right after a content node, so accumulate a newline to differentiate the two
        this.currentPos = this.accumulate(this.currentPos, '\n');

        const startPos = this.currentPos;

        //for each line of concrete syntax (e.g. #ifdef, #else, and #endif) we
        // must accumulate an extra newline which was eaten by the compiler
        this.visitRegion(node.thenbranch);

        //if we visited anything in the thenbranch, we need to accumulate a newline b/c the last of those was a text node
        if(node.thenbranch.segments.length > 0 && !node.thenbranch.hidden) {
            this.currentPos = this.accumulate(this.currentPos, '\n');
        }

        this.visitRegion(node.elsebranch);

        node.span = {
            start: startPos,
            end: this.currentPos
        };

        //if we visited anything in the elsebranch, we need to accumulate a newline b/c the last of those was a text node
        if(node.elsebranch.segments.length > 0 && !node.elsebranch.hidden) {
            this.currentPos = this.accumulate(this.currentPos, '\n');
        }
    }

    visitRegion(node: RegionNode): void {
        const startPos = this.currentPos;
        if (node.hidden) {
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
        const newNode: ChoiceNode = copyFromChoice(node);
        newNode.thenbranch = newthenbranch;
        newNode.elsebranch = newelsebranch;

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
            segments: rewrittenNodes,
            hidden: false
        };

        return region;
    }
}

function copyFromChoice(node: ChoiceNode): ChoiceNode {
    return {
        type: "choice",
        name: node.name,
        kind: node.kind,
        thenbranch: node.thenbranch,
        elsebranch: node.elsebranch
    };
}

export class ViewRewriter extends SyntaxRewriter {
    constructor(public selections: Selector[]) {
        super();
    }

    rewriteChoice(node: ChoiceNode): ChoiceNode[] {
        const newthenbranch = this.rewriteRegion(node.thenbranch);
        const newelsebranch = this.rewriteRegion(node.elsebranch);
        const newNode: ChoiceNode = copyFromChoice(node);
        newNode.thenbranch = newthenbranch;
        newNode.elsebranch = newelsebranch;

        //see if this alternative should be displayed
        if (isBranchActive(node, getSelectionForNode(node, this.selections), "thenbranch")) {
            newNode.thenbranch = this.rewriteRegion(node.thenbranch);

        } else {
            newNode.thenbranch = Object.assign({}, node.thenbranch);
            newNode.thenbranch.hidden = true;
        }

        //see if this alternative should be displayed
        if (isBranchActive(node, getSelectionForNode(node, this.selections), "elsebranch")) {
            newNode.elsebranch = this.rewriteRegion(node.elsebranch);
        } else {
            newNode.elsebranch = Object.assign({}, node.elsebranch);
            newNode.elsebranch.hidden = true;
        }
        return [newNode];
    }
}

export class ASTSearcher {

    constructor(public doc: RegionNode) {
    }

    isLocationAtStartOfSpan(location: TextBuffer.IPoint) : boolean {
        return this.checkStartsInRegion(this.doc, location);
    }

    checkStartsInRegion(region: RegionNode, location: TextBuffer.IPoint) : boolean {
        var found = false;
        for (var segment of region.segments) {
            if (spanContainsPoint(segment.span, location)) {
                if (segment.span.start[0] === location.row && segment.span.start[1] === location.column) return true;
                else if (segment.type === 'text') return false;
                else return this.checkStartsInRegion(segment.thenbranch, location) || this.checkStartsInRegion(segment.elsebranch, location);
            }
        }
    }

    checkEndsInRegion(region: RegionNode, location: TextBuffer.IPoint) : boolean {
        for (var segment of region.segments) {
            if (inclusiveSpanContainsPoint(segment.span, location)) {
                if (segment.span.end[0] === location.row && segment.span.end[1] === location.column) return true; //this means it's at the end of a span
                else if (segment.type === 'text') return false; //if it's not at the end, and this is a text node, finish the search
                else return this.checkEndsInRegion(segment.thenbranch, location) || this.checkEndsInRegion(segment.elsebranch, location); //not at the end of this node, but could be at the start of some subnode
            }
        }
    }

    isLocationAtEndOfSpan(location: TextBuffer.IPoint) : boolean {
        return this.checkEndsInRegion(this.doc, location);
    }

}

export class NodeInserter extends SyntaxRewriter {

    constructor(public newNode: SegmentNode, public location: TextBuffer.IPoint, public editor: AtomCore.IEditor) {
        super();
    }

    // rewriteDocument(doc: RegionNode) {
    //     //walk the span before and after we do the change, because spans have semantic meaning here
    //     const walker = new SpanWalker();
    //     // walker.visitRegion(doc);
    //     const newDoc = this.rewriteRegion(doc);
    //     walker.visitRegion(newDoc);
    //     return newDoc;
    // }

    rewriteRegion(region: RegionNode): RegionNode {
        var newSegments: SegmentNode[] = []
        for (var segment of region.segments) {
            if (spanContainsPoint(segment.span, this.location)) {
                if (segment.type === 'choice') {
                    newSegments = newSegments.concat(this.rewriteChoice(segment));
                } else {
                    newSegments = newSegments.concat(this.rewriteContent(segment));
                }
            } else {
                newSegments.push(segment);
            }
        }
        var newRegion: RegionNode = { segments: newSegments, type: "region", span: region.span };
        return newRegion;
    }

    rewriteContent(node: ContentNode): SegmentNode[] {
        const firstRange: Span = {
            start: node.span.start,
            end: [this.location.row, this.location.column]
        };
        const secondRange: Span = {
            start: [this.location.row, this.location.column],
            end: node.span.end
        };

        const first: ContentNode = {
            type: "text",
            content: this.editor.getTextInBufferRange(firstRange) + '\n'
        }
        const third: ContentNode = {
            type: "text",
            content: this.editor.getTextInBufferRange(secondRange)
        }
        return [first, this.newNode, third];
    }

}

export class AlternativeInserter extends SyntaxRewriter {

    constructor(public altNode: SegmentNode, public location: TextBuffer.IPoint, public branch: Branch, public dimension: string) {
        super();
    }

    rewriteChoice(node: ChoiceNode) {
        var newthenbranch : RegionNode;
        var newelsebranch : RegionNode;
        const newNode: ChoiceNode = copyFromChoice(node);

        var newThenSegments = [];
        var newElseSegments = [];
        var deeper = false;
        for (var segment of node.thenbranch.segments) {
            if (inclusiveSpanContainsPoint(segment.span, this.location)) {
                if (segment.type === 'choice') {
                    //in this case, the alternative will need to be inserted at a deeper node
                    deeper = true;
                    newThenSegments = newThenSegments.concat(this.rewriteChoice(segment));
                } else {
                    newThenSegments = newThenSegments.concat(this.rewriteContent(segment));
                }
            } else {
                newThenSegments.push(segment);
            }
        }

        for (var segment of node.elsebranch.segments) {
            if (inclusiveSpanContainsPoint(segment.span, this.location)) {
                if (segment.type === 'choice') {
                    deeper = true;
                    newElseSegments = newElseSegments.concat(this.rewriteChoice(segment));
                } else {
                    newElseSegments = newElseSegments.concat(this.rewriteContent(segment));
                }
            } else {
                newElseSegments.push(segment);
            }
        }
        if (!deeper) {
            if(node.elsebranch.segments.length != 0) throw "This alternative already exists";
            else newElseSegments = [this.altNode];
        }

        newNode.thenbranch.segments = newThenSegments;
        newNode.elsebranch.segments = newElseSegments;

        return [newNode];
    }


    // rewriteDocument(doc: RegionNode) {
    //     //walk the span before and after we do the change, because spans have semantic meaning here
    //     const walker = new SpanWalker();
    //     walker.visitRegion(doc);
    //     const newDoc = this.rewriteRegion(doc);
    //     walker.visitRegion(newDoc);
    //     return newDoc;
    // }

    rewriteRegion(region: RegionNode): RegionNode {
        var newSegments: SegmentNode[] = []
        for (var segment of region.segments) {
            if (inclusiveSpanContainsPoint(segment.span, this.location)) {
                if (segment.type === 'choice') {
                    newSegments = newSegments.concat(this.rewriteChoice(segment));
                } else {
                    newSegments = newSegments.concat(this.rewriteContent(segment));
                }
            } else {
                newSegments.push(segment);
            }
        }
        var newRegion: RegionNode = { segments: newSegments, type: "region", span: region.span };
        return newRegion;
    }
}

export class EditPreserver extends SyntaxWalker {
    index: number;

      constructor(public editor: AtomCore.IEditor, public selections: Selector[],
        public regionMarkers: AtomCore.IDisplayBufferMarker[]) {
        super();
    }

    visitDocument(doc: RegionNode): boolean {
      this.index = -1;
      return this.visitRegion(doc);
    }

    visitContent(node: ContentNode): boolean {
        const oldContent = node.content;
        node.content = this.editor.getTextInBufferRange(node.marker.getBufferRange()) + '\n'; //add back in a newline that is technically out of the range of this node. for reasons.
        return oldContent != node.content;
    }

    visitRegion(region: RegionNode): boolean {
        //first visit each node in the region
        var changes = false;
        for (const node of region.segments) {
            switch (node.type) {
                case "text":
                    changes = this.visitContent(node) || changes;
                    break;
                case "choice":
                    changes = this.visitChoice(node) || changes;
                    break;
            }
        }

        //then look for nodes which have been marked for deletion (null)
        for(var i = 0; i < region.segments.length; i ++) {
          if(region.segments[i].type == 'choice' && (region.segments[i] as ChoiceNode).delete) {
            region.segments.splice(i, 1);
          }
        }

        //then combine any adjacent text nodes
        for( var i=0; i < region.segments.length; i ++) {
            //if two text segments are abutting each other, simply combine them
            if(region.segments[i].type === "text" && (i+1 < region.segments.length) && region.segments[i+1].type === "text") {
                (region.segments[i] as ContentNode).content = (region.segments[i] as ContentNode).content + (region.segments[i+1] as ContentNode).content;
                region.segments.splice(i+1, 1);
            }
        }
        return changes;
    }

    visitChoice(node: ChoiceNode): boolean {
        var recurseThen = false;
        var recurseElse = false;
        var changes = false;
        var selection = getSelectionForNode(node, this.selections);
        if (isBranchActive(node, selection, "thenbranch") && !node.thenbranch.hidden) {
            this.index += 1;
            var subsumed = false;
            //if the marker hasn't been invalidated, then we're good to go.
            if(this.regionMarkers[this.index] && this.regionMarkers[this.index].isValid()) {
              recurseThen = true;
            } else {
                changes = true;
                //on the other hand, if the marker was invalidated, we need to seriously modify this node

                //if the this-branch of a positive node was destroyed but the else-branch wasn't
                //make the node a contrapositive node, and
                //use the old else-branch as the new then-branch
                if((node.elsebranch.segments.length > 0) && (this.regionMarkers[this.index+1] && this.regionMarkers[this.index+1].isValid()) || node.elsebranch.hidden) {
                    if(node.kind === 'positive') {
                      node.kind = 'contrapositive';
                      node.thenbranch = {segments: node.elsebranch.segments, type: 'region'}
                      node.elsebranch.segments = [];
                    } else if(node.kind === 'contrapositive') {
                      //and vice versa
                      node.kind = 'positive';
                      node.thenbranch = {segments: node.elsebranch.segments, type: 'region'}
                      node.elsebranch.segments = [];
                    }
                    //increment if the other branch that was just subsumed *wasn't* hidden
                    if(node.elsebranch.hidden == false) this.index += 1;

                    //then recurse on the now-then-branch
                    recurseThen = true;
                } else {
                    //in the case where both alternatives were shown, and neither marker is valid
                    //the user has attempted to delete this entire choice node, so we mark is as null, for deletion
                    node.delete = true;

                }

                subsumed = true; // subsumed is true because in any case, we no longer need to look at the else-branch
                if(node.elsebranch.segments.length > 0) this.index += 1;

            }
        }
        if (isBranchActive(node, selection, "elsebranch") && !subsumed && (node.elsebranch.segments.length > 0) && !node.elsebranch.hidden) {
            this.index += 1;
            //if the marker hasn't been invalidated, then we're good to go.
            if(this.regionMarkers[this.index] && this.regionMarkers[this.index].isValid()) {
              recurseElse = true;
            } else {
                changes = true;
              //on the other hand, if the marker was invalidated, we need to seriously modify this node

              //if the else-branch of a positive node was destroyed but the then-branch wasn't
              //simply make this a single-alternative node
              if((this.regionMarkers[this.index-1] && this.regionMarkers[this.index-1].isValid()) || node.thenbranch.hidden) {
                node.elsebranch.segments = [];
              } else {
                //in the case where both alternatives were shown, and neither marker is valid
                //the user has attempted to delete this entire choice node, so we mark it for deletion
                node.delete = true;
              }


            }
        }
        if(recurseThen) changes = this.visitRegion(node.thenbranch) || changes;
        if(recurseElse) changes = this.visitRegion(node.elsebranch) || changes;
        return changes;
    }
}

export function getSelectionForNode(node: ChoiceNode, selections: Selector[]): Selector {
    return getSelectionForDim(node.name, selections);
}

export function getSelectionForDim(dimName: string, selections: Selector[]): Selector {
    for (var sel of selections) {
        if (sel.name === dimName) return sel;
    }
    return { name: dimName, status: 'BOTH' };
}

export function isBranchActive(node, selection: Selector, branch: Branch) {
    if (selection) {
        return selection.status === 'BOTH' ||
            (selection.status === 'DEF' && branch === "thenbranch" && node.kind === "positive"
            || selection.status === 'DEF' && branch === "elsebranch" && node.kind === "contrapositive"
            || selection.status === 'NDEF' && branch === "elsebranch" && node.kind === "positive"
            || selection.status === 'NDEF' && branch === "thenbranch" && node.kind === "contrapositive")
    } else return false;
}


export class DimensionDeleter extends SyntaxRewriter {
    constructor(public selection: Selector) {
        super();
    }

    rewriteChoice(node: ChoiceNode): SegmentNode[] {
        if (node.name != this.selection.name) return [node]; // make no changes unless this is the dimension being deleted
        var newNodes = [];
        if (isBranchActive(node, this.selection, "thenbranch")) {
            for (var oldNode of node.thenbranch.segments) {
                newNodes.push(... this.rewriteNode(oldNode));
            }
        }
        if (isBranchActive(node, this.selection, "elsebranch")) {
            for (var oldNode of node.thenbranch.segments) {
                newNodes.push(... this.rewriteNode(oldNode));
            }
        }

        return newNodes;
    }

    rewriteNode(node: SegmentNode): SegmentNode[] {
        if (node.type === 'choice') return this.rewriteChoice(node);
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

function spanContainsPoint(outer: Span, inner: TextBuffer.IPoint): boolean {
    return (
        ((outer.start[0] === inner.row && outer.start[1] <= inner.column) // inclusive at the beginning, exclusive at the end
            ||
            (outer.start[0] < inner.row)) // if the outer span starts before the second Span
        &&
        ((outer.end[0] > inner.row)
            ||
            (outer.end[1] > inner.column && outer.end[0] === inner.row))
    )
}

function inclusiveSpanContainsPoint(outer: Span, inner: TextBuffer.IPoint) : boolean {
    return (
        ((outer.start[0] === inner.row && outer.start[1] < inner.column) // exclusive at the beginning, inclusive at the end
            ||
            (outer.start[0] < inner.row)) // if the outer span starts before the second Span
        &&
        ((outer.end[0] > inner.row)
            ||
            (outer.end[1] >= inner.column && outer.end[0] === inner.row))
    )
}

export function renderDocument(region: RegionNode): string {
    return region.segments.reduce(renderContents, '');
}

function renderContents(acc: string, node: SegmentNode): string {
    if (node.type === 'choice') {
        if (!node.thenbranch.hidden && node.thenbranch.segments.length > 0) acc = acc + renderDocument(node.thenbranch);
        if (!node.elsebranch.hidden && node.elsebranch.segments.length > 0) acc = acc + renderDocument(node.elsebranch);
        return acc;
    }
    else {
        return acc + node.content;
    }
}

export function docToPlainText(region: RegionNode): string {
    var last;
    var finalText = '';
    for(var i = 0; i < region.segments.length; i ++) {
      var seg = region.segments[i];
      var text = nodeToPlainText('', seg);
      //if this segment is right after a choice segment, make sure it begins with a newline
      if(last && last.type === 'choice' && text[0] != '\n') text = '\n' + text;
      last = seg;
      finalText = finalText + text;
    }
    return finalText;
}

export function nodeToPlainText(acc: string, node: SegmentNode): string {
    if (node.type === 'choice') {
        var syntax = ''
        if (node.kind === 'positive') syntax = '#ifdef';
        else syntax = '#ifndef'
        syntax = syntax + ' ' + node.name;


        var rest = docToPlainText(node.thenbranch);
        if(rest[0] != '\n') rest = '\n' + rest;

        acc = acc + syntax + rest

        if (node.elsebranch.segments.length > 0) {
            var rest = docToPlainText(node.elsebranch);
            if(rest[0] != '\n') rest = '\n' + rest;
            acc = acc + '#else' + rest
        }
        acc = acc + '#endif';
        return acc;
    }
    else {
        return acc + node.content;
    }
}
