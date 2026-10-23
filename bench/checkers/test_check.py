from check import check


def test_kinds():
    assert check("number", 5006.71, "5006.71")[0]
    assert check("number", 3, 3.0)[0]
    assert not check("number", 3, "three")[0]
    assert check("string", "Ken Thompson", " ken thompson ")[0]
    assert check("path", "projects/a/x.log", "/abs/bench/data/fs-fixture/projects/a/x.log")[0]
    assert check("list", [1, 2], "[1, 2]")[0]
    assert not check("list", [1, 2], [2, 1])[0]
    assert check("set", ["b", "a"], ["a", "b"])[0]
    assert check("exact", {"USD": 1}, {"USD": 1.0})[0]
    assert check("list", ["projects/x"], ["./projects/x"])[0]
