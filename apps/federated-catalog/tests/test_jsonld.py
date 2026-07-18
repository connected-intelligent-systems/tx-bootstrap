import pytest
from pyld import jsonld

from federated_catalog.jsonld import SecureDocumentLoader, json_strings, prepare_dataset, rdf_nquads


def test_multilingual_dataset_policy_and_blank_nodes_round_trip_to_rdf() -> None:
    source = {
        "@context": {
            "dcat": "http://www.w3.org/ns/dcat#",
            "dct": "http://purl.org/dc/terms/",
            "odrl": "http://www.w3.org/ns/odrl/2/",
        },
        "@id": "dataset-1",
        "@type": "dcat:Dataset",
        "dct:title": [
            {"@value": "Mobility data", "@language": "en"},
            {"@value": "Mobilitätsdaten", "@language": "de"},
        ],
        "odrl:hasPolicy": {
            "@type": "odrl:Set",
            "odrl:permission": {"odrl:action": {"@id": "http://www.w3.org/ns/odrl/2/use"}},
        },
    }

    compacted, expanded = prepare_dataset(
        source,
        None,
        "https://provider.example/dsp/",
        SecureDocumentLoader(1, 10_000),
    )
    document = rdf_nquads(expanded, "https://provider.example/dsp/")

    assert set(json_strings(compacted["dct:title"])) == {"Mobility data", "Mobilitätsdaten"}
    assert "http://www.w3.org/ns/odrl/2/hasPolicy" in document
    assert "_:" in document


@pytest.mark.parametrize("url", ["http://example.com/context", "https://127.0.0.1/context"])
def test_remote_context_loader_rejects_unencrypted_or_private_targets(url: str) -> None:
    with pytest.raises(jsonld.JsonLdError):
        SecureDocumentLoader._validate_url(url)
