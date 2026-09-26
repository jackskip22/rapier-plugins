
# The neighbour search skips another image paragraph

This paragraph comes before the picture and stays the anchor whenever the block right after the picture cannot be one -- another image paragraph, or a heading -- so the words below keep their own separate life.

![The picture under test][diamond] <!--md-layout:v1 width=35% wrap=around x=20%-->

![An unrelated second picture right after it][opaque]

This paragraph comes after the picture and is its ordinary anchor whenever nothing else stands in the way, wrapping beside it line by line the way the fixture is built to show plainly.

[diamond]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAA40lEQVR42u3bSQ6DMBAAQZ7N7zvXSNmAYHuWPtQ9akUJ2DPbvu9bZ5sB1n8IOgfgSbsAvNEmAF+UD8ABZQNwQrkAXFAmAH9IH4AbpA3AjdIFYIA0ARgofAAmCBuAicIFYIEwAVhoeQACWBaAQKYHIKBpAQhseAASGBaARG4PQEK3BSCxvwNQwOUAFHI6AAUdDkBhPwPQwMcANPISgIb8Bvgb4L+AzwE+Cfou4Nug5wGeCHkm6Kmw9wLeDHk36O2w8wFOiDgj5JSYc4JOijor7LS4+wJujLgz5NaYe4Nujro73MEDip6/b+F9FD0AAAAASUVORK5CYII=
[opaque]: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAAoCAYAAACiu5n/AAAAQ0lEQVR42u3PMQEAAAQAMHl0095PC48dC7DI6vkkhIWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFby0f7s8anCQmZQAAAABJRU5ErkJggg==
