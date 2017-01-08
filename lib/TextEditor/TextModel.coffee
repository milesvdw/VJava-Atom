#class for adding to and manipulating a cc text file. Editing the file does not automatically update the model.

class TextModel
  editor: null
  constructor: (editor) ->
    @editor = editor

  addChoiceNode: (bufferRow, model, leftContent, rightContent, dimName) ->
