{Point} = require 'atom';
$ = require 'jquery'

# <editor-fold> x
#</editor-fold>



###
Object that contains rendering functions as well as a general function to sequence multiple renderers. Renderers should have the arguments (model, editor), representing the parsed cc model and text editor respectively
###
class FoldHandler
	ranges: {}
	editor: null
	constructor: (editor) ->
		@editor = editor;

	addFold: (row, range) ->
		@ranges[row] = range;

	gutterHandler: (event) =>
		row = event.target.parentElement.dataset.bufferRow;
		if !@ranges[row]
			return;
		range = @ranges[row];

		#Atom can handle unfolding, we only need to do the folding part.
		@editor.setSelectedBufferRange(range);
		@editor.foldSelectedLines();

module.exports =
ui =
{
	###
	Run a series of renderers with the arguments (model, editor) with no return one after the other on the same model. Handles editor grabbing.
	###
	renderAsSequence: (model, renderSequence) ->
		editor = atom.workspace.getActiveTextEditor();
		for renderer in renderSequence
			renderer(model, editor);

	###
	Render folding sections.
	###
	renderFolding: (model, editor) ->
		#Make it so when the gutter is clicked it will actually fold and unfold properly
		foldHandler = new FoldHandler(editor);
		for node in model
			if node.type == "choice"
				ui._setFoldable(editor, node.span.start[0], [node.span.start, node.span.end], foldHandler);
		editorView = atom.views.getView(editor);
		gutter = editorView.shadowRoot.querySelector('.gutter');
		#atom will handle unfolding, we only need to handle refolding.
		$(gutter).on('click', '.foldable:not(.folded)', foldHandler.gutterHandler);


	###
	Add a fold toggle to the given row that will open and close the given range.
	###
	_setFoldable: (editor, row, range, foldHandler) ->
		marker = editor.markBufferPosition([row, 0])
		editor.decorateMarker(marker, {'type': 'line-number', 'class': 'foldable'})
		foldHandler.addFold(row, range)


}
