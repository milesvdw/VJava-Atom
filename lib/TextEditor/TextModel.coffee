#class for adding to and manipulating a cc text file. Editing the file does not automatically update the model.

class TextModel
  populate: (textEditor, model) ->
    text = model.toText()
    textEditor.setText(text)
