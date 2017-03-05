'use babel';
export class SyntaxWalker {
    visitDocument(doc) {
        this.visitRegion(doc);
    }
    visitContent(node) { }
    visitChoice(node) {
        this.visitRegion(node.thenbranch);
        this.visitRegion(node.elsebranch);
    }
    visitRegion(region) {
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
export class SpanWalker extends SyntaxWalker {
    constructor() {
        super(...arguments);
        this.currentPos = [0, 0];
    }
    accumulate(pos, str) {
        const newlineMatches = str.match(/\n/g) || [];
        const newlineCount = newlineMatches.length;
        let endPos;
        const lastNewlineIndex = str.lastIndexOf("\n");
        if (lastNewlineIndex === -1) {
            endPos = [pos[0], pos[1] + str.length];
        }
        else {
            endPos = [pos[0] + newlineCount, str.length - lastNewlineIndex - 1];
        }
        return endPos;
    }
    visitContent(node) {
        const endPos = this.accumulate(this.currentPos, node.content);
        node.span = {
            start: this.currentPos,
            end: endPos
        };
        this.currentPos = endPos;
    }
    visitChoice(node) {
        const startPos = this.currentPos;
        if (!node.thenbranch.hidden && node.thenbranch.segments.length > 0)
            this.currentPos = this.accumulate(this.currentPos, '\n');
        this.visitRegion(node.thenbranch);
        if (!node.elsebranch.hidden && node.elsebranch.segments.length > 0)
            this.currentPos = this.accumulate(this.currentPos, '\n');
        this.visitRegion(node.elsebranch);
        this.currentPos = this.accumulate(this.currentPos, '\n');
        node.span = {
            start: startPos,
            end: this.currentPos
        };
    }
    visitRegion(node) {
        const startPos = this.currentPos;
        if (node.hidden) {
            node.span = null;
        }
        else {
            super.visitRegion(node);
            node.span = {
                start: startPos,
                end: this.currentPos
            };
        }
    }
}
class SyntaxRewriter {
    rewriteDocument(document) {
        const newDoc = this.rewriteRegion(document);
        const walker = new SpanWalker();
        walker.visitRegion(newDoc);
        return newDoc;
    }
    rewriteContent(node) {
        return [node];
    }
    rewriteChoice(node) {
        const newthenbranch = this.rewriteRegion(node.thenbranch);
        const newelsebranch = this.rewriteRegion(node.elsebranch);
        const newNode = copyFromChoice(node);
        newNode.thenbranch = newthenbranch;
        newNode.elsebranch = newelsebranch;
        return [newNode];
    }
    rewriteRegion(doc) {
        const rewrittenNodes = [];
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
        const region = {
            type: "region",
            segments: rewrittenNodes,
            hidden: false
        };
        return region;
    }
}
function copyFromChoice(node) {
    return {
        type: "choice",
        name: node.name,
        kind: node.kind,
        thenbranch: node.thenbranch,
        elsebranch: node.elsebranch
    };
}
export class ViewRewriter extends SyntaxRewriter {
    constructor(selections) {
        super();
        this.selections = selections;
    }
    rewriteChoice(node) {
        const newthenbranch = this.rewriteRegion(node.thenbranch);
        const newelsebranch = this.rewriteRegion(node.elsebranch);
        const newNode = copyFromChoice(node);
        newNode.thenbranch = newthenbranch;
        newNode.elsebranch = newelsebranch;
        if (isBranchActive(node, getSelectionForNode(node, this.selections), "thenbranch")) {
            newNode.thenbranch = this.rewriteRegion(node.thenbranch);
        }
        else {
            newNode.thenbranch = Object.assign({}, node.thenbranch);
            newNode.thenbranch.hidden = true;
        }
        if (isBranchActive(node, getSelectionForNode(node, this.selections), "elsebranch")) {
            newNode.elsebranch = this.rewriteRegion(node.elsebranch);
        }
        else {
            newNode.elsebranch = Object.assign({}, node.elsebranch);
            newNode.elsebranch.hidden = true;
        }
        return [newNode];
    }
}
export class NodeInserter extends SyntaxRewriter {
    constructor(newNode, location, editor) {
        super();
        this.newNode = newNode;
        this.location = location;
        this.editor = editor;
    }
    rewriteDocument(doc) {
        const walker = new SpanWalker();
        walker.visitRegion(doc);
        const newDoc = this.rewriteRegion(doc);
        walker.visitRegion(newDoc);
        return newDoc;
    }
    rewriteRegion(region) {
        var newSegments = [];
        for (var segment of region.segments) {
            if (spanContainsPoint(segment.span, this.location)) {
                if (segment.type === 'choice') {
                    newSegments = newSegments.concat(this.rewriteChoice(segment));
                }
                else {
                    newSegments = newSegments.concat(this.rewriteContent(segment));
                }
            }
            else {
                newSegments.push(segment);
            }
        }
        var newRegion = { segments: newSegments, type: "region", span: region.span };
        return newRegion;
    }
    rewriteContent(node) {
        const firstRange = {
            start: node.span.start,
            end: [this.location.row, this.location.column]
        };
        const secondRange = {
            start: [this.location.row, this.location.column],
            end: node.span.end
        };
        const first = {
            type: "text",
            content: this.editor.getTextInBufferRange(firstRange) + '\n'
        };
        const third = {
            type: "text",
            content: this.editor.getTextInBufferRange(secondRange)
        };
        return [first, this.newNode, third];
    }
}
export class AlternativeInserter extends SyntaxRewriter {
    constructor(altNode, location, branch, dimension) {
        super();
        this.altNode = altNode;
        this.location = location;
        this.branch = branch;
        this.dimension = dimension;
    }
    rewriteChoice(node) {
        var newthenbranch;
        var newelsebranch;
        const newNode = copyFromChoice(node);
        if (this.branch === "elsebranch"
            && node.elsebranch.span.end[0] === this.location.row && node.elsebranch.span.end[1] === this.location.column && node.name === this.dimension) {
            if (node.elsebranch.segments.length != 0)
                throw "This alternative already exists";
            else
                newelsebranch = {
                    type: "region",
                    segments: [this.altNode]
                };
            newthenbranch = super.rewriteRegion(node.thenbranch);
        }
        else if (this.branch === "thenbranch"
            && node.thenbranch.span.end[0] === this.location.row && node.thenbranch.span.end[1] === this.location.column && node.name === this.dimension) {
            if (node.thenbranch.segments.length != 0)
                throw "This alternative already exists";
            else
                newthenbranch = {
                    type: "region",
                    segments: [this.altNode]
                };
            newelsebranch = super.rewriteRegion(node.elsebranch);
        }
        else {
            newthenbranch = this.rewriteRegion(node.thenbranch);
            newelsebranch = this.rewriteRegion(node.elsebranch);
        }
        newNode.thenbranch = newthenbranch;
        newNode.elsebranch = newelsebranch;
        return [newNode];
    }
    rewriteDocument(doc) {
        const walker = new SpanWalker();
        walker.visitRegion(doc);
        const newDoc = this.rewriteRegion(doc);
        walker.visitRegion(newDoc);
        return newDoc;
    }
    rewriteRegion(region) {
        var newSegments = [];
        for (var segment of region.segments) {
            if (inclusiveSpanContainsPoint(segment.span, this.location)) {
                if (segment.type === 'choice') {
                    newSegments = newSegments.concat(this.rewriteChoice(segment));
                }
                else {
                    newSegments = newSegments.concat(this.rewriteContent(segment));
                }
            }
            else {
                newSegments.push(segment);
            }
        }
        var newRegion = { segments: newSegments, type: "region", span: region.span };
        return newRegion;
    }
}
export class EditPreserver extends SyntaxWalker {
    constructor(editor, selections, regionMarkers) {
        super();
        this.editor = editor;
        this.selections = selections;
        this.regionMarkers = regionMarkers;
    }
    visitDocument(doc) {
        this.index = -1;
        this.visitRegion(doc);
    }
    visitContent(node) {
        node.content = this.editor.getTextInBufferRange(node.marker.getBufferRange());
    }
    visitRegion(region) {
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
        for (var i = 0; i < region.segments.length; i++) {
            if (region.segments[i].type == 'choice' && region.segments[i].delete) {
                region.segments.splice(i, 1);
            }
        }
    }
    visitChoice(node) {
        var recurseThen = false;
        var recurseElse = false;
        var selection = getSelectionForNode(node, this.selections);
        if (isBranchActive(node, selection, "thenbranch") && !node.thenbranch.hidden) {
            this.index += 1;
            var subsumed = false;
            if (this.regionMarkers[this.index].isValid()) {
                recurseThen = true;
            }
            else {
                if ((node.elsebranch.segments.length > 0) && this.regionMarkers[this.index + 1].isValid() || node.elsebranch.hidden) {
                    if (node.kind === 'positive') {
                        node.kind = 'contrapositive';
                        node.thenbranch = { segments: node.elsebranch.segments, type: 'region' };
                        node.elsebranch.segments = [];
                    }
                    else if (node.kind === 'contrapositive') {
                        node.kind = 'positive';
                        node.thenbranch = { segments: node.elsebranch.segments, type: 'region' };
                        node.elsebranch.segments = [];
                    }
                    if (node.elsebranch.hidden == false)
                        this.index += 1;
                    recurseThen = true;
                }
                else {
                    node.delete = true;
                }
                subsumed = true;
                this.index += 1;
            }
        }
        if (isBranchActive(node, selection, "elsebranch") && !subsumed && (node.elsebranch.segments.length > 0) && !node.elsebranch.hidden) {
            this.index += 1;
            if (this.regionMarkers[this.index].isValid()) {
                recurseElse = true;
            }
            else {
                if (this.regionMarkers[this.index - 1].isValid() || node.thenbranch.hidden) {
                    node.elsebranch.segments = [];
                }
                else {
                    node.delete = true;
                }
            }
        }
        if (recurseThen)
            this.visitRegion(node.thenbranch);
        if (recurseElse)
            this.visitRegion(node.elsebranch);
    }
}
export function getSelectionForNode(node, selections) {
    return getSelectionForDim(node.name, selections);
}
export function getSelectionForDim(dimName, selections) {
    for (var sel of selections) {
        if (sel.name === dimName)
            return sel;
    }
    return { name: dimName, status: 'BOTH' };
}
export function isBranchActive(node, selection, branch) {
    if (selection) {
        return selection.status === 'BOTH' ||
            (selection.status === 'DEF' && branch === "thenbranch" && node.kind === "positive"
                || selection.status === 'DEF' && branch === "elsebranch" && node.kind === "contrapositive"
                || selection.status === 'NDEF' && branch === "elsebranch" && node.kind === "positive"
                || selection.status === 'NDEF' && branch === "thenbranch" && node.kind === "contrapositive");
    }
    else
        return false;
}
export class DimensionDeleter extends SyntaxRewriter {
    constructor(selection) {
        super();
        this.selection = selection;
    }
    rewriteChoice(node) {
        if (node.name != this.selection.name)
            return [node];
        var newNodes = [];
        if (isBranchActive(node, this.selection, "thenbranch")) {
            for (var oldNode of node.thenbranch.segments) {
                newNodes.push(...this.rewriteNode(oldNode));
            }
        }
        if (isBranchActive(node, this.selection, "elsebranch")) {
            for (var oldNode of node.thenbranch.segments) {
                newNodes.push(...this.rewriteNode(oldNode));
            }
        }
        return newNodes;
    }
    rewriteNode(node) {
        if (node.type === 'choice')
            return this.rewriteChoice(node);
        else
            return this.rewriteContent(node);
    }
}
class SimplifierRewriter extends SyntaxRewriter {
    rewriteRegion(region) {
        const newSegments = [];
        for (const segment of region.segments) {
            if (segment.type === "text") {
                this.simplifyContent(newSegments, segment);
            }
            else {
                newSegments.push(...this.rewriteChoice(segment));
            }
        }
        const newRegion = {
            type: "region",
            segments: newSegments
        };
        return newRegion;
    }
    simplifyContent(newSegments, contentNode) {
        const last = newSegments[newSegments.length - 1];
        if (last && last.type === "text") {
            last.content += contentNode.content;
        }
        else {
            const newSegment = {
                type: "text",
                content: contentNode.content
            };
            newSegments.push(newSegment);
        }
    }
}
function spanContainsPoint(outer, inner) {
    return (((outer.start[0] === inner.row && outer.start[1] < inner.column)
        ||
            (outer.start[0] < inner.row))
        &&
            ((outer.end[0] > inner.row)
                ||
                    (outer.end[1] > inner.column && outer.end[0] === inner.row)));
}
function inclusiveSpanContainsPoint(outer, inner) {
    return (((outer.start[0] === inner.row && outer.start[1] < inner.column)
        ||
            (outer.start[0] < inner.row))
        &&
            ((outer.end[0] > inner.row)
                ||
                    (outer.end[1] >= inner.column && outer.end[0] === inner.row)));
}
export function renderDocument(region) {
    return region.segments.reduce(renderContents, '');
}
function renderContents(acc, node) {
    if (node.type === 'choice') {
        if (!node.thenbranch.hidden && node.thenbranch.segments.length > 0)
            acc = acc + '\n' + renderDocument(node.thenbranch);
        if (!node.elsebranch.hidden && node.elsebranch.segments.length > 0)
            acc = acc + '\n' + renderDocument(node.elsebranch);
        acc = acc + '\n';
        return acc;
    }
    else {
        return acc + node.content;
    }
}
export function docToPlainText(region) {
    var last;
    var finalText = '';
    for (var i = 0; i < region.segments.length; i++) {
        var seg = region.segments[i];
        var text = nodeToPlainText('', seg);
        if (last && last.type === 'choice' && text[0] != '\n')
            text = '\n' + text;
        last = seg;
        finalText = finalText + text;
    }
    return finalText;
}
export function nodeToPlainText(acc, node) {
    if (node.type === 'choice') {
        var syntax = '';
        if (node.kind === 'positive')
            syntax = '\n#ifdef';
        else
            syntax = '\n#ifndef';
        syntax = syntax + ' ' + node.name;
        var rest = docToPlainText(node.thenbranch);
        if (rest[0] != '\n')
            rest = '\n' + rest;
        acc = acc + syntax + rest;
        if (node.elsebranch.segments.length > 0) {
            var rest = docToPlainText(node.elsebranch);
            if (rest[0] != '\n')
                rest = '\n' + rest;
            acc = acc + '\n#else' + rest;
        }
        acc = acc + '\n#endif';
        return acc;
    }
    else {
        return acc + node.content;
    }
}
