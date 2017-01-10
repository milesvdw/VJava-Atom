$ = require 'jquery'
getMaxRowRange = (require './renderTools.coffee').getMaxRowRange


module.exports =
class ColorRender
	editor: null
	markers: []
	selectedMarker: null;
	selectedDimMarker: null;

	constructor: (editor) ->
		@editor = editor;

	#Makes it so mousing over a choice highlights the choice and the dimension.
	initEvents: ->
		# veiw = atom.views.getView(@editor)
		# $(veiw).on 'mousemove', (event) =>
		# 	marker = @getMarkerAt(event.pageY)
		# 	if (marker != undefined)
		# 		if marker.isEqual( @selectedMarker)
		# 			return
		# 		if @selectedMarker != null
		# 			@unselectMarker(selectedMarker);
		# 		@selectMarker(marker);
		# 		@selectedtMarker = marker;
		#
		# 		properties = marker.getProperties();
		# 		dimRow = properties["dimRow"];
				#
				# dimMarker = @getMarkerAtBufferPoint([dimRow, 0]);
				# @colorDimMarker(dimMarker, properties["class"])
				#
				# if @selectedDimMarker != null
				# 	@unselectDimMarker(@selectedDimMarker)
				# @selectedDimMarker = dimMarker

	#Main function. Color text in editor based on cc model.
	renderColor: (model) ->
		for node in model
			if node.type == "choice"

				leftMarker = @colorNode(node.left, 'left-choice')
				leftBounds = @markerTopAndBottomBound(leftMarker);
				leftMarker.setProperties({"dimRow":node.span.start[0], "bounds": leftBounds})
				@markers.push(leftMarker);

				rightMarker = @colorNode(node.right, 'right-choice')
				rightBounds = @markerTopAndBottomBound(rightMarker)

				rightMarker.setProperties({"dimRow":node.span.start[0], "bounds": rightBounds})

				@markers.push(rightMarker);

				@renderColor(node.left)
				@renderColor(node.right)

	#Remove coloring.
	derenderColor: ->
		for marker in @markers
			marker.destroy();
		@markers = []

	#Mark a line with the given tag
	colorRange: (range, css) ->
		marker = @editor.markBufferRange(range)
		decorator = @editor.decorateMarker(marker, {'type':'line', 'class':css})
		marker.setProperties({'class':css, 'decorator':decorator})

		return marker

	#Color the maximum range of a choice node with the given css tag
	colorNode: (node, css) ->
		rowRange = getMaxRowRange(node);
		return @colorRange([[rowRange.min, 0], [rowRange.max, 0]], css);

	#Get the {bottomBound: lowest y position, topBound: highest y position} of a marker.
	markerTopAndBottomBound: (marker) ->
		markerRange = marker.getBufferRange();

		startRow = markerRange.start.row
		endRow = markerRange.end.row

		view = atom.views.getView(@editor)

		topLineRect =  $(".line[data-screen-row = " + startRow + "]", view.shadowRoot)[0].getBoundingClientRect();

		topBound = topLineRect.top;

		bottomLineRect = $(".line[data-screen-row = " + endRow + "]", view.shadowRoot)[0].getBoundingClientRect();
		bottomBound = bottomLineRect.bottom;
		return {bottomBound: bottomBound, topBound:topBound}

	#Get a marker at the client y position.
	getMarkerAt: (yPos) ->
		for marker in @markers
			bounds = marker.getProperties()["bounds"];
			if(yPos < bounds.bottomBound && yPos > bounds.topBound)
				return marker;

	#Get a marker at the buffer position
	getMarkerAtBufferPoint:(point) ->
		for marker in @markers
			if marker.getBufferRange().containsPoint(point)
				return marker

	#Change left/right-choice to left/right-choice-selected
	selectMarker: (marker) ->
		properties = marker.getProperties()
		if properties["class"] == "left-choice"
			properties['decorator'].setProperties({"class": "left-choice-selected"})

		else if properties["class"] == "right-choice"
			properties['decorator'].setProperties({"class": "right-choice-selected"})

	#Change left/right-choice-selected to left/right-choice
	unselectMarker: (marker) ->
		properties = marker.getProperties()

		if properties["class"] == "left-choice-selected"
			properties['decorator'].setProperties({"class": "left-choice"})

		if properties["class"] == "right-choice-selected"
			properties['decorator'].setProperties({"class": "right-choice"})

	#Color a dimension marker to a specific css class
	colorDimMarker: (css, marker) ->
		marker.getProperties()['decorator'].setProperties({"class" : css})
	#Uncolor a dimension marker to a specific css class
	uncolorDimMarker: (marker) ->
		marker.getProperties()['decorator'].setProperties({"class" : "unselected"})
