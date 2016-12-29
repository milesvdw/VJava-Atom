


module.exports =
{
###
Run a series of renderers with the arguments (model, editor) with no return one after the other on the same model. Handles editor grabbing.
###
renderAsSequence: (model, renderSequence) ->
	editor = atom.workspace.getActiveTextEditor();
	for renderer in renderSequence
		renderer(model, editor);
###
	Find the largest range of rows possible in a array of cc nodes. Returns an object of the form {max: maximum row, min: minimum row}.
###
getMaxRowRange: (node) ->
	if node.length == 0
		console.error "zero length node!"
		return; 
	maxRow = 0
	minRow = Number.MAX_SAFE_INTEGER
	for element in node
		if element.span.start[0] < minRow
			minRow = element.span.start[0]
		if element.span.end[0] > maxRow
			maxRow = element.span.end[0]
	return {max: maxRow, min: minRow}
}
