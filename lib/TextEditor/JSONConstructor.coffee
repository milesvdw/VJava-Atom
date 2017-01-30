atom.exports =
{
  #Create a selection
  #name: the name of the dimension to select on
  #chooseRight: will pick thenbranch if true, elsebranch if false.
  selection: (name, chooseRight) ->
    altString = ""
    if chooseRight then altString = "thenbranch" else altString = "elsebranch"
    return {name: name, alternative: altString}

  #Create a projection.
  #program: an array of segments
  #selections: an array of selections
  projection: (program, selections) ->
    return {program: program, selections: selections}
}
