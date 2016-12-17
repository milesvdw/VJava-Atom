


module.exports =
###
Run a series of renderers with the arguments (model, editor) with no return one after the other on the same model. Handles editor grabbing.
###
renderAsSequence: (model, renderSequence) ->
	editor = atom.workspace.getActiveTextEditor();
	for renderer in renderSequence
		renderer(model, editor);
